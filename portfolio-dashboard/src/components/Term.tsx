import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../settings';
import type { TermKey } from '../i18n/glossary';

/** A domain term with a plain-language tooltip (hover, focus or tap). */
export function Term({ k, children }: { k: TermKey; children?: ReactNode }) {
  const { term } = useSettings();
  const entry = term(k);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  return (
    <span
      ref={ref}
      className="term"
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {children ?? entry.term}
      <svg className="term-i" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {open && <Bubble anchor={ref} id={id} title={entry.term} body={entry.def} />}
    </span>
  );
}

function Bubble({ anchor, id, title, body }: { anchor: React.RefObject<HTMLElement | null>; id: string; title: string; body: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const b = el.current?.getBoundingClientRect();
    if (!a || !b) return;
    const margin = 12;
    let left = a.left + a.width / 2 - b.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - b.width - margin));
    const above = a.top - b.height - 8;
    setPos({ top: above > margin ? above : a.bottom + 8, left });
  }, [anchor]);
  return createPortal(
    <div ref={el} id={id} role="tooltip" className="bubble" style={{ top: pos.top, left: pos.left }}>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>,
    document.body,
  );
}
