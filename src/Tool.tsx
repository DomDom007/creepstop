// Creepstop: log each recurring bill as it arrives and get flagged the moment one quietly goes up, with a message to push back.
import { useState } from "react";
import { moneyFmt } from "./lib/money";
import { mailLink } from "./lib/share";
import { uid, useCopy, useStored } from "./lib/store";
import { todayISO } from "./lib/time";
import { CurrencySelect, Section, Stat, Stats } from "./ui/kit";

const T = "creepstop";
type Bill = { id: string; name: string; provider: string; every: "month" | "quarter" | "year"; since: string; history: { date: string; amount: number }[] };
const per = { month: 12, quarter: 4, year: 1 };
const mAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
const SAMPLE: Bill[] = [
  { id: "b1", name: "Home internet", provider: "Topnet", every: "month", since: "2023-05-01", history: [6, 5, 4, 3, 2, 1, 0].map((m, i) => ({ date: mAgo(m), amount: i < 4 ? 69 : 79 })) },
  { id: "b2", name: "Mobile plan", provider: "Ooredoo", every: "month", since: "2024-01-01", history: [5, 4, 3, 2, 1, 0].map(m => ({ date: mAgo(m), amount: 35 })) },
  { id: "b3", name: "Car insurance", provider: "STAR", every: "year", since: "2021-03-01", history: [{ date: mAgo(24), amount: 820 }, { date: mAgo(12), amount: 870 }, { date: mAgo(0), amount: 960 }] },
  { id: "b4", name: "Streaming", provider: "Netflix", every: "month", since: "2022-06-01", history: [5, 4, 3, 2, 1, 0].map((m, i) => ({ date: mAgo(m), amount: i < 3 ? 34.9 : 39.9 })) },
];

export default function Creepstop() {
  const [bills, setBills] = useStored<Bill[]>(T, "bills", SAMPLE);
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [name, setName] = useStored(T, "name", "Leila Haddad");
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [nb, setNb] = useState({ name: "", provider: "", every: "month" as Bill["every"], amount: "" });
  const [open, setOpen] = useState<string | null>(null);
  const { copy, copied } = useCopy();
  const money = moneyFmt(cur);

  const info = (b: Bill) => {
    const h = [...b.history].sort((a, c) => a.date.localeCompare(c.date));
    const first = h[0]?.amount ?? 0, last = h[h.length - 1]?.amount ?? 0;
    // Compare with the lowest price paid in roughly the last year, so a rise three months ago still counts.
    const recent = h.filter(p => Date.now() - new Date(p.date).getTime() <= 395 * 86400000);
    const prev = recent.length ? Math.min(...recent.map(p => p.amount)) : last;
    const jump = prev ? (last - prev) / prev : 0, total = first ? (last - first) / first : 0;
    return { h, first, last, prev, jump, total, yearlyNow: last * per[b.every], extraYear: (last - first) * per[b.every], years: Math.max(1, (Date.now() - new Date(b.since).getTime()) / 3.15e10) };
  };
  const rows = bills.map(b => ({ b, i: info(b) })).sort((a, c) => c.i.extraYear - a.i.extraYear);
  const flagged = rows.filter(r => r.i.jump > 0.001);
  const letter = (b: Bill, i: ReturnType<typeof info>) => `Hello ${b.provider},

I have been a customer since ${new Date(b.since).getFullYear()}. My ${b.name.toLowerCase()} has gone from ${money(i.prev)} to ${money(i.last)} (${Math.round(i.jump * 100)}% more) ${i.total > i.jump ? `and ${Math.round(i.total * 100)}% in total since I joined ` : ""}without any change to my service.

I have seen lower prices from other providers for the same service. Before I consider switching, could you move me back to ${money(i.prev)}, or offer a loyalty rate?

Thank you,
${name}`;
  const log = (b: Bill) => { const a = parseFloat(entry[b.id] ?? ""); if (!a) return; setBills(bills.map(x => x.id === b.id ? { ...x, history: [...x.history, { date: todayISO(), amount: a }] } : x)); setEntry({ ...entry, [b.id]: "" }); };

  return (
    <div className="stack">
      <Section title="Your bills" aside={<CurrencySelect id="cs-cur" value={cur} onChange={setCur} />}>
        <Stats><Stat value={bills.length} label="Bills tracked" /><Stat value={money(rows.reduce((a, r) => a + r.i.yearlyNow, 0))} label="Per year now" /><Stat value={flagged.length} label="Went up this year" tone={flagged.length ? "bad" : "good"} /><Stat value={money(rows.reduce((a, r) => a + Math.max(0, r.i.extraYear), 0))} label="Extra per year vs when you joined" tone="bad" /></Stats>
      </Section>
      <Section title="Every bill">
        <div className="stack" style={{ gap: 12 }}>
          {rows.map(({ b, i }) => (
            <div key={b.id} className="cs-bill" style={{ borderLeftColor: i.jump > 0.001 ? "var(--bad)" : "var(--line)" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div><strong>{b.name}</strong> <span className="note">{b.provider} · every {b.every}</span></div>
                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                  <span className="cs-now">{money(i.last)}</span>
                  {i.jump > 0.001 && <span className="pill bad">+{Math.round(i.jump * 100)}% this year</span>}
                  {i.total > 0.001 && <span className="pill warn">+{Math.round(i.total * 100)}% since you joined</span>}
                </div>
              </div>
              <div className="cs-spark" aria-hidden="true">{i.h.map((p, k) => <span key={k} title={`${p.date}: ${money(p.amount)}`} style={{ height: `${(p.amount / Math.max(...i.h.map(x => x.amount))) * 100}%`, background: k > 0 && p.amount > i.h[k - 1].amount ? "var(--bad)" : "var(--accent)" }} />)}</div>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <label className="field" style={{ flex: "0 0 160px" }}><span>New bill amount</span><input className="input num" value={entry[b.id] ?? ""} onChange={e => setEntry({ ...entry, [b.id]: e.target.value })} onKeyDown={e => e.key === "Enter" && log(b)} /></label>
                <button className="btn small" onClick={() => log(b)}>Log it</button>
                {i.jump > 0.001 && <button className="btn small primary" onClick={() => setOpen(open === b.id ? null : b.id)}>Push back</button>}
                <button className="btn ghost small danger" onClick={() => setBills(bills.filter(x => x.id !== b.id))}>Delete</button>
              </div>
              {open === b.id && <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                <textarea className="input" rows={9} readOnly value={letter(b, i)} />
                <div className="row"><button className="btn small" onClick={() => copy(letter(b, i))}>{copied ? "Copied" : "Copy message"}</button><a className="btn small" href={mailLink("", `My ${b.name.toLowerCase()} price`, letter(b, i))}>Open in email</a></div>
                <p className="note">Call and ask for the “retention” or “loyalty” team. Mention the cheaper offer by name.</p>
              </div>}
            </div>
          ))}
        </div>
      </Section>
      <div className="grid2">
        <Section title="Track a new bill">
          <form className="stack" style={{ gap: 10 }} onSubmit={e => { e.preventDefault(); const a = parseFloat(nb.amount); if (!nb.name.trim() || !a) return; setBills([...bills, { id: uid(), name: nb.name.trim(), provider: nb.provider, every: nb.every, since: todayISO(), history: [{ date: todayISO(), amount: a }] }]); setNb({ name: "", provider: "", every: "month", amount: "" }); }}>
            <div className="row"><label className="field"><span>Bill</span><input id="cs-n" className="input" value={nb.name} onChange={e => setNb({ ...nb, name: e.target.value })} /></label><label className="field"><span>Provider</span><input id="cs-p" className="input" value={nb.provider} onChange={e => setNb({ ...nb, provider: e.target.value })} /></label></div>
            <div className="row" style={{ alignItems: "flex-end" }}><label className="field"><span>Every</span><select id="cs-e" className="input" value={nb.every} onChange={e => setNb({ ...nb, every: e.target.value as Bill["every"] })}><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></label><label className="field"><span>Current amount</span><input id="cs-a" className="input num" value={nb.amount} onChange={e => setNb({ ...nb, amount: e.target.value })} /></label><button className="btn primary" type="submit">Add</button></div>
          </form>
        </Section>
        <Section title="Your name for letters"><label className="field"><span>Signed as</span><input id="cs-me" className="input" value={name} onChange={e => setName(e.target.value)} /></label></Section>
      </div>
      <style>{`.cs-bill{border-left:4px solid;padding:4px 0 12px 14px;border-bottom:1px solid var(--line)}.cs-now{font-family:var(--serif);font-size:26px}.cs-spark{display:flex;gap:3px;align-items:flex-end;height:44px;margin:10px 0}.cs-spark span{width:14px;border-radius:2px 2px 0 0;min-height:3px}`}</style>
    </div>
  );
}
