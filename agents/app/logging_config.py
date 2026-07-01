import contextvars
import logging
import sys

import structlog

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)
customer_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "customer", default=None
)


def _inject_context(logger, method, event_dict):
    rid = request_id_var.get()
    if rid:
        event_dict["request_id"] = rid
    cust = customer_var.get()
    if cust:
        event_dict["customer"] = cust
    return event_dict


def setup_logging(*, debug: bool = False):
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        _inject_context,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if debug else logging.INFO
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(structlog.stdlib.ProcessorFormatter(processors=[
        *shared_processors,
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.processors.JSONRenderer(),
    ]))
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if debug else logging.INFO)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(service="agents", module=name)
