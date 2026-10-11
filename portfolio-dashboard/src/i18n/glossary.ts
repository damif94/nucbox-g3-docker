import type { Lang } from './strings';

type Entry = Record<Lang, { term: string; def: string }>;

// Plain-language definitions shown in tooltips. Keep each to 1–2 short sentences.
export const GLOSSARY = {
  nav: {
    es: { term: 'Valor total del portafolio', def: 'Lo que valdría todo hoy si se vendiera a precios de cierre: efectivo + inversiones + intereses ganados, menos lo que debes (como opciones vendidas).' },
    en: { term: 'Total portfolio value', def: 'What everything would be worth today at closing prices: cash + investments + interest earned, minus what you owe (such as options sold).' },
  },
  marketValue: {
    es: { term: 'Valor de mercado', def: 'Cuánto vale una posición hoy según el último precio. En bonos incluye el interés acumulado.' },
    en: { term: 'Market value', def: 'What a position is worth today at the latest price. For bonds it includes accrued interest.' },
  },
  settled: {
    es: { term: 'Base liquidada', def: 'Cuenta solo operaciones ya pagadas y entregadas. Una compra hecha hoy puede tardar días en "liquidarse".' },
    en: { term: 'Settled basis', def: 'Counts only trades already paid for and delivered. A trade made today can take days to "settle".' },
  },
  accrued: {
    es: { term: 'Interés devengado', def: 'Intereses que el bono ya "ganó" desde el último pago pero que todavía no te depositaron.' },
    en: { term: 'Accrued interest', def: 'Interest the bond has already earned since its last payment but that has not been paid to you yet.' },
  },
  costBasis: {
    es: { term: 'Costo', def: 'Lo que pagaste por la posición (precio promedio × cantidad).' },
    en: { term: 'Cost basis', def: 'What you paid for the position (average price × quantity).' },
  },
  avgCost: {
    es: { term: 'Costo promedio', def: 'Precio promedio pagado por unidad. En bonos se expresa como % del valor nominal.' },
    en: { term: 'Average cost', def: 'Average price paid per unit. For bonds it is shown as % of face value.' },
  },
  unrealized: {
    es: { term: 'Ganancia/pérdida no realizada', def: 'Diferencia entre el valor actual y lo que pagaste. Es "en papel": solo se vuelve real si vendes.' },
    en: { term: 'Unrealized gain/loss', def: 'Difference between today’s value and what you paid. It is "on paper" until you sell.' },
  },
  cash: {
    es: { term: 'Efectivo disponible', def: 'Dinero en cuenta corriente y en la cuenta de inversión, listo para usar o invertir.' },
    en: { term: 'Available cash', def: 'Money in the checking and investment accounts, ready to spend or invest.' },
  },
  income: {
    es: { term: 'Ingreso anual estimado', def: 'Cupones de bonos y dividendos que deberías cobrar en 12 meses si nada cambia. Es una estimación.' },
    en: { term: 'Estimated annual income', def: 'Bond coupons and dividends you should collect over 12 months if nothing changes. It is an estimate.' },
  },
  contingent: {
    es: { term: 'Cupón condicional', def: 'Solo se paga si se cumple una condición (por ejemplo, que los índices no caigan bajo cierto nivel).' },
    en: { term: 'Contingent coupon', def: 'Paid only if a condition is met (for example, the indices staying above a certain level).' },
  },
  flows: {
    es: { term: 'Aportes y retiros', def: 'Dinero que entró o salió de tus cuentas desde afuera. No es ganancia ni pérdida.' },
    en: { term: 'Contributions & withdrawals', def: 'Money that came into or left your accounts from outside. It is not a gain or a loss.' },
  },
  investmentResult: {
    es: { term: 'Resultado de inversión', def: 'Cuánto cambió el valor por movimientos de precios e intereses, sin contar aportes ni retiros.' },
    en: { term: 'Investment result', def: 'How much value changed from price moves and interest, excluding money added or withdrawn.' },
  },
  allocation: {
    es: { term: 'Distribución de activos', def: 'Cómo está repartido tu dinero entre tipos de inversión. Ayuda a ver si dependes demasiado de uno.' },
    en: { term: 'Asset allocation', def: 'How your money is split across investment types. It shows whether you depend too much on one.' },
  },
  concentration: {
    es: { term: 'Concentración por emisor', def: 'Cuánto dependes de cada empresa o banco que emitió tus títulos. Si el emisor quiebra, puedes perder esa parte.' },
    en: { term: 'Issuer concentration', def: 'How much you depend on each company or bank that issued your securities. If the issuer fails, that part is at risk.' },
  },
  countryRisk: {
    es: { term: 'País de riesgo', def: 'El país cuya economía y política afectan más la capacidad de pago del emisor.' },
    en: { term: 'Country of risk', def: 'The country whose economy and politics most affect the issuer’s ability to pay.' },
  },
  bond: {
    es: { term: 'Bono', def: 'Un préstamo que le haces a un gobierno o empresa. Te paga intereses (cupones) y te devuelve el capital al vencimiento.' },
    en: { term: 'Bond', def: 'A loan you make to a government or company. It pays you interest (coupons) and returns the principal at maturity.' },
  },
  structured: {
    es: { term: 'Nota estructurada', def: 'Un título emitido por un banco cuyo pago depende de otros activos (índices, ETFs, crédito de un país). Ofrece más rendimiento a cambio de condiciones y riesgo del banco emisor.' },
    en: { term: 'Structured note', def: 'A security issued by a bank whose payout depends on other assets (indices, ETFs, a country’s credit). Higher yield in exchange for conditions and the issuing bank’s risk.' },
  },
  eln: {
    es: { term: 'ELN (nota ligada a acciones)', def: 'Nota estructurada cuyo pago depende del desempeño de índices o acciones. Si caen demasiado, puedes recibir menos capital.' },
    en: { term: 'ELN (equity-linked note)', def: 'Structured note whose payout depends on stock indices or shares. If they fall too far, you may get back less principal.' },
  },
  cln: {
    es: { term: 'CLN (nota ligada a crédito)', def: 'Nota que paga un interés alto mientras un tercero (aquí, Brasil) no deje de pagar sus deudas. Si ese tercero incumple, pierdes parte o todo.' },
    en: { term: 'CLN (credit-linked note)', def: 'Note paying high interest as long as a third party (here, Brazil) keeps paying its debts. If it defaults, you lose part or all.' },
  },
  etf: {
    es: { term: 'ETF', def: 'Un fondo que cotiza en bolsa como una acción y replica un índice o activo (por ejemplo, oro o energía).' },
    en: { term: 'ETF', def: 'A fund that trades like a stock and tracks an index or asset (for example, gold or energy).' },
  },
  coveredCall: {
    es: { term: 'Call cubierto', def: 'Vendiste el derecho a que otro te compre tus acciones a un precio fijo. Cobraste una prima, pero renuncias a la subida por encima de ese precio.' },
    en: { term: 'Covered call', def: 'You sold someone the right to buy your shares at a fixed price. You collected a premium but give up gains above that price.' },
  },
  strike: {
    es: { term: 'Precio de ejercicio', def: 'Precio fijo al que se puede comprar (call) o vender (put) el activo con la opción.' },
    en: { term: 'Strike price', def: 'Fixed price at which the option lets the holder buy (call) or sell (put) the asset.' },
  },
  expiry: {
    es: { term: 'Vencimiento de la opción', def: 'Último día en que la opción puede ejercerse. Después deja de existir.' },
    en: { term: 'Option expiry', def: 'Last day the option can be exercised. After that it ceases to exist.' },
  },
  itm: {
    es: { term: 'Dentro del dinero', def: 'Para un call: el precio actual supera al de ejercicio. Si sigue así al vencimiento, probablemente te compren las acciones.' },
    en: { term: 'In the money', def: 'For a call: today’s price is above the strike. If it stays that way at expiry, your shares will likely be bought from you.' },
  },
  coupon: {
    es: { term: 'Cupón', def: 'Interés que paga un bono, expresado como % anual de su valor nominal.' },
    en: { term: 'Coupon', def: 'Interest a bond pays, shown as an annual % of its face value.' },
  },
  face: {
    es: { term: 'Valor nominal', def: 'Monto que el emisor devuelve al vencimiento. En bonos, la "cantidad" es el nominal.' },
    en: { term: 'Face value', def: 'Amount the issuer repays at maturity. For bonds, "quantity" is the face value.' },
  },
  pricePct: {
    es: { term: 'Precio (% del nominal)', def: 'Los bonos cotizan en % del nominal: 90 significa que pagas 90 por cada 100 que te devolverán.' },
    en: { term: 'Price (% of face)', def: 'Bonds trade as % of face value: 90 means you pay 90 for every 100 you will be repaid.' },
  },
  ytw: {
    es: { term: 'Rendimiento al peor caso (YTW)', def: 'Ganancia anual que obtendrías comprando hoy y manteniendo, en el escenario menos favorable (vencimiento o rescate anticipado).' },
    en: { term: 'Yield to worst (YTW)', def: 'Annual return if bought today and held, under the least favorable scenario (maturity or early call).' },
  },
  ytm: {
    es: { term: 'Rendimiento al vencimiento (YTM)', def: 'Ganancia anual si mantienes el bono hasta que vence y el emisor paga todo.' },
    en: { term: 'Yield to maturity (YTM)', def: 'Annual return if you hold the bond until maturity and the issuer pays everything.' },
  },
  duration: {
    es: { term: 'Duración', def: 'Sensibilidad a las tasas de interés. Duración 10 ≈ si las tasas suben 1%, el precio cae ~10%.' },
    en: { term: 'Duration', def: 'Sensitivity to interest rates. Duration 10 ≈ if rates rise 1%, the price falls ~10%.' },
  },
  maturity: {
    es: { term: 'Vencimiento', def: 'Fecha en que el emisor devuelve el capital y la inversión termina.' },
    en: { term: 'Maturity', def: 'Date the issuer repays the principal and the investment ends.' },
  },
  perpetual: {
    es: { term: 'Perpetuo', def: 'Bono sin fecha de devolución fija; el emisor decide si y cuándo lo rescata.' },
    en: { term: 'Perpetual', def: 'Bond with no fixed repayment date; the issuer decides if and when to redeem it.' },
  },
  callable: {
    es: { term: 'Rescatable (callable)', def: 'El emisor puede devolverte el dinero antes del vencimiento en ciertas fechas. Suele hacerlo cuando le conviene a él.' },
    en: { term: 'Callable', def: 'The issuer can repay you before maturity on certain dates, usually when it suits them.' },
  },
  observation: {
    es: { term: 'Fecha de observación', def: 'Día en que la nota estructurada revisa los índices para decidir si paga cupón o se cancela anticipadamente.' },
    en: { term: 'Observation date', def: 'Day the structured note checks its indices to decide whether it pays a coupon or redeems early.' },
  },
  ladder: {
    es: { term: 'Escalera de vencimientos', def: 'Cuánto dinero vuelve a tus manos y cuándo. Vencimientos repartidos reducen el riesgo de reinvertir todo junto.' },
    en: { term: 'Maturity ladder', def: 'How much money comes back to you and when. Spread-out maturities reduce reinvestment risk.' },
  },
  rating: {
    es: { term: 'Calificación crediticia', def: 'Nota de una agencia sobre la probabilidad de que el emisor pague. BBB o mejor = "grado de inversión"; BB o menor = mayor riesgo.' },
    en: { term: 'Credit rating', def: 'An agency’s grade of how likely the issuer is to pay. BBB or better = "investment grade"; BB or lower = higher risk.' },
  },
  isin: {
    es: { term: 'ISIN', def: 'Código internacional único de 12 caracteres que identifica un título en cualquier mercado.' },
    en: { term: 'ISIN', def: 'Unique 12-character international code identifying a security in any market.' },
  },
  cusip: {
    es: { term: 'CUSIP', def: 'Código de 9 caracteres usado en EE.UU. y Canadá para identificar un título.' },
    en: { term: 'CUSIP', def: '9-character code used in the US and Canada to identify a security.' },
  },
  sedol: {
    es: { term: 'SEDOL', def: 'Código de 7 caracteres usado por la Bolsa de Londres.' },
    en: { term: 'SEDOL', def: '7-character code used by the London Stock Exchange.' },
  },
  figi: {
    es: { term: 'FIGI', def: 'Identificador abierto y gratuito (OpenFIGI) para cada instrumento en cada mercado. Lo usamos para completar datos.' },
    en: { term: 'FIGI', def: 'Free, open identifier (OpenFIGI) for each instrument on each venue. We use it to fill in details.' },
  },
  compositeFigi: {
    es: { term: 'FIGI compuesto', def: 'Agrupa todas las bolsas de un mismo país donde cotiza el instrumento.' },
    en: { term: 'Composite FIGI', def: 'Groups all exchanges in one country where the instrument trades.' },
  },
  bankId: {
    es: { term: 'ID interno del banco', def: 'Código que el banco usa internamente para el título (SecID/BPSA).' },
    en: { term: 'Bank internal ID', def: 'Code the bank uses internally for the security (SecID/BPSA).' },
  },
  dda: {
    es: { term: 'Cuenta corriente (DDA)', def: 'Cuenta de depósito a la vista: el dinero está disponible en cualquier momento.' },
    en: { term: 'Checking account (DDA)', def: 'Demand deposit account: money is available at any time.' },
  },
  margin: {
    es: { term: 'Cuenta de margen', def: 'Cuenta de corretaje que permite operar opciones y pedir prestado usando tus inversiones como garantía.' },
    en: { term: 'Margin account', def: 'Brokerage account that allows options trading and borrowing against your investments.' },
  },
  custody: {
    es: { term: 'Cuenta de custodia', def: 'Cuenta donde el banco guarda tus bonos y notas a tu nombre.' },
    en: { term: 'Custody account', def: 'Account where the bank holds your bonds and notes in your name.' },
  },
  creditLine: {
    es: { term: 'Línea de crédito', def: 'Préstamo pre-aprobado que puedes usar cuando quieras. Solo pagas interés sobre lo que uses.' },
    en: { term: 'Credit line', def: 'Pre-approved loan you can draw anytime. You only pay interest on what you use.' },
  },
  withholding: {
    es: { term: 'Retención de impuestos', def: 'Impuesto que se descuenta automáticamente antes de pagarte un dividendo (para no residentes en EE.UU., típicamente 30%).' },
    en: { term: 'Withholding tax', def: 'Tax deducted automatically before a dividend is paid (typically 30% for non-US residents).' },
  },
  earlyRedemption: {
    es: { term: 'Rescate anticipado', def: 'El emisor devolvió el capital antes del vencimiento (en notas estructuradas, "autocall").' },
    en: { term: 'Early redemption', def: 'The issuer repaid principal before maturity (in structured notes, an "autocall").' },
  },
  contra: {
    es: { term: 'Asiento interno', def: 'Registro contable espejo entre tus cuentas o la custodia. No es dinero nuevo; se oculta para no contar dos veces.' },
    en: { term: 'Internal entry', def: 'Mirror bookkeeping entry between your accounts or custody. Not new money; hidden to avoid double counting.' },
  },
  tradeSettle: {
    es: { term: 'Fecha de operación / liquidación', def: 'Operación = cuando se acordó la compra. Liquidación = cuando se pagó y entregó (suele ser días después).' },
    en: { term: 'Trade / settlement date', def: 'Trade = when the purchase was agreed. Settlement = when it was paid and delivered (usually days later).' },
  },
  paymentRank: {
    es: { term: 'Prelación de pago', def: 'Orden en que cobras si el emisor quiebra. "Senior" cobra antes que "subordinado".' },
    en: { term: 'Payment rank', def: 'Your place in line if the issuer goes bankrupt. "Senior" is paid before "subordinated".' },
  },
  regS: {
    es: { term: 'Reg S', def: 'Título vendido fuera de EE.UU. bajo una exención de registro de la SEC; solo para inversores no estadounidenses.' },
    en: { term: 'Reg S', def: 'Security sold outside the US under an SEC registration exemption; for non-US investors only.' },
  },
  entity: {
    es: { term: 'Entidad', def: 'Sociedad del grupo que lleva la cuenta: SNB = banco, SSL = corredora de valores.' },
    en: { term: 'Entity', def: 'Group company holding the account: SNB = bank, SSL = securities broker-dealer.' },
  },
  cif: {
    es: { term: 'CIF', def: 'Número de cliente del banco; agrupa todas tus cuentas.' },
    en: { term: 'CIF', def: 'The bank’s customer number; it groups all your accounts.' },
  },
  premium: {
    es: { term: 'Prima', def: 'Precio de la opción. Si la vendiste, la cobraste al abrir la posición.' },
    en: { term: 'Premium', def: 'The price of an option. If you sold it, you collected it when opening the position.' },
  },
} satisfies Record<string, Entry>;

export type TermKey = keyof typeof GLOSSARY;
