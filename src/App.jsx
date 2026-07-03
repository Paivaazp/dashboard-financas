import { useState, useEffect, useMemo } from "react";

const CARDS = [
  { id: "nubank", name: "Nubank", color: "#8A05BE", text: "#FFFFFF" },
  { id: "picpay", name: "PicPay", color: "#21C25E", text: "#0B2E1B" },
  { id: "santander", name: "Santander", color: "#EC0000", text: "#FFFFFF" },
  { id: "dinheiro", name: "Dinheiro/Outro", color: "#3A3F38", text: "#FFFFFF" },
];

const DEFAULT_CATEGORIES = [
  { id: "uber", label: "Uber", icon: "🚗" },
  { id: "ifood", label: "iFood", icon: "🍔" },
  { id: "mercado", label: "Mercado", icon: "🛒" },
  { id: "cabelo", label: "Cabelo", icon: "💇" },
  { id: "farmacia", label: "Farmácia", icon: "💊" },
  { id: "fatura-cartao", label: "Fatura Cartão", icon: "💳" },
  { id: "outros", label: "Outros", icon: "🧾" },
];

const MONTHS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const STORAGE_KEY = "finance-dashboard-v1";

function fmt(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseMoney(value) {
  return parseFloat(String(value).replace(",", ".")) || 0;
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [salary, setSalary] = useState(0);
  const [salaryInput, setSalaryInput] = useState("");
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [form, setForm] = useState({
    date: todayISO(),
    categoryId: "uber",
    cardId: "nubank",
    value: "",
    desc: "",
  });

  const [newCatLabel, setNewCatLabel] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [cardFilter, setCardFilter] = useState(null);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const data = JSON.parse(saved);

        setSalary(data.salary || 0);
        setSalaryInput(String(data.salary ?? ""));
        setEntries(data.entries || []);
        setCategories(data.categories || DEFAULT_CATEGORIES);
      }
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    }

    setLoaded(true);
  }, []);

  function persist(next) {
    try {
      const payload = {
        salary: next.salary ?? salary,
        entries: next.entries ?? entries,
        categories: next.categories ?? categories,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSaveError(false);
    } catch (e) {
      console.error("Erro ao salvar dados:", e);
      setSaveError(true);
    }
  }

  function commitSalary() {
    const v = parseMoney(salaryInput);
    setSalary(v);
    persist({ salary: v });
  }

  function addEntry() {
    const v = parseMoney(form.value);

    if (!v || v <= 0) return;

    const entry = {
      id: Date.now().toString(36),
      date: form.date,
      categoryId: form.categoryId,
      cardId: form.cardId,
      value: v,
      desc: form.desc.trim(),
    };

    const next = [entry, ...entries];
    setEntries(next);
    persist({ entries: next });

    setForm((f) => ({
      ...f,
      value: "",
      desc: "",
    }));
  }

  function removeEntry(id) {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    persist({ entries: next });
  }

  function addCategory() {
    const label = newCatLabel.trim();

    if (!label) return;

    const id =
      label.toLowerCase().replace(/\s+/g, "-") +
      "-" +
      Date.now().toString(36).slice(-3);

    const next = [...categories, { id, label, icon: "🏷️" }];

    setCategories(next);
    persist({ categories: next });

    setForm((f) => ({
      ...f,
      categoryId: id,
    }));

    setNewCatLabel("");
    setAddingCat(false);
  }

  const monthEntries = useMemo(() => {
    return entries.filter((e) => e.date.startsWith(monthCursor));
  }, [entries, monthCursor]);

  const filteredEntries = useMemo(() => {
    if (cardFilter) {
      return monthEntries.filter((e) => e.cardId === cardFilter);
    }

    return monthEntries;
  }, [monthEntries, cardFilter]);

  const totalGasto = monthEntries.reduce((s, e) => s + e.value, 0);
  const saldo = salary - totalGasto;

  const perCard = useMemo(() => {
    const map = {};

    CARDS.forEach((c) => {
      map[c.id] = 0;
    });

    monthEntries.forEach((e) => {
      map[e.cardId] = (map[e.cardId] || 0) + e.value;
    });

    return map;
  }, [monthEntries]);

  const perCategory = useMemo(() => {
    const map = {};

    monthEntries.forEach((e) => {
      map[e.categoryId] = (map[e.categoryId] || 0) + e.value;
    });

    return Object.entries(map)
      .map(([id, val]) => ({
        id,
        val,
        cat: categories.find((c) => c.id === id),
      }))
      .sort((a, b) => b.val - a.val);
  }, [monthEntries, categories]);

  function shiftMonth(delta) {
    const [y, m] = monthCursor.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);

    setMonthCursor(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  const monthLabel = (() => {
    const [y, m] = monthCursor.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  })();

  if (!loaded) {
    return <div className="loading">carregando…</div>;
  }

  return (
    <div className="fd-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');

        html,
        body,
        #root {
          margin: 0;
          width: 100%;
          min-height: 100%;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #F0EEE9;
        }

        .loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #F0EEE9;
          color: #20241F;
          font-family: Inter, sans-serif;
        }

        .fd-root {
          min-height: 100vh;
          background: #F0EEE9;
          color: #20241F;
          font-family: 'Inter', sans-serif;
          padding: 20px 16px 60px;
        }

        .fd-wrap {
          max-width: 980px;
          margin: 0 auto;
        }

        .fd-mono {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 600;
        }

        .fd-display {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
        }

        .fd-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
          gap: 12px;
          flex-wrap: wrap;
        }

        .fd-title {
          font-size: 24px;
          letter-spacing: -0.02em;
        }

        .fd-month {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #FFFFFF;
          border: 1px solid #DEDAD1;
          border-radius: 999px;
          padding: 6px 14px;
        }

        .fd-month button {
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 20px;
          color: #20241F;
          padding: 2px 6px;
          line-height: 1;
        }

        .fd-month span {
          font-size: 13px;
          min-width: 70px;
          text-align: center;
        }

        .fd-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }

        .fd-sumcard {
          background: #FFFFFF;
          border: 1px solid #DEDAD1;
          border-radius: 14px;
          padding: 14px 16px;
        }

        .fd-sumcard .lbl {
          font-size: 11px;
          color: #6B6F68;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 6px;
        }

        .fd-sumcard .val {
          font-size: 20px;
        }

        .fd-salary-input {
          border: none;
          outline: none;
          background: transparent;
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 600;
          font-size: 20px;
          width: 100%;
          color: #20241F;
        }

        .fd-saldo-pos {
          color: #2F6B4F;
        }

        .fd-saldo-neg {
          color: #B23B2E;
        }

        .fd-cards-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin-bottom: 22px;
        }

        .fd-card {
          border-radius: 14px;
          padding: 14px;
          cursor: pointer;
          position: relative;
          border: 2px solid transparent;
          transition: transform .12s ease;
          min-height: 84px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .fd-card:active {
          transform: scale(0.98);
        }

        .fd-card.active {
          border-color: #20241F;
        }

        .fd-card .cname {
          font-size: 12px;
          opacity: 0.85;
          font-weight: 600;
        }

        .fd-card .cval {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 16px;
          font-weight: 600;
        }

        .fd-section-title {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6B6F68;
          margin: 22px 0 10px;
        }

        .fd-form {
          background: #FFFFFF;
          border: 1px solid #DEDAD1;
          border-radius: 14px;
          padding: 14px;
          margin-bottom: 22px;
        }

        .fd-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .fd-chip {
          border: 1px solid #DEDAD1;
          background: #F7F6F3;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          user-select: none;
        }

        .fd-chip.sel {
          background: #20241F;
          color: #fff;
          border-color: #20241F;
        }

        .fd-chip.add {
          border-style: dashed;
        }

        .fd-cat-input {
          border: 1px solid #DEDAD1;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          outline: none;
        }

        .fd-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .fd-pill {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
          font-weight: 600;
          border: 2px solid transparent;
          user-select: none;
        }

        .fd-pill.sel {
          border-color: #20241F;
        }

        .fd-row2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .fd-row3 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-bottom: 12px;
        }

        .fd-input {
          border: 1px solid #DEDAD1;
          border-radius: 10px;
          padding: 12px;
          font-size: 16px;
          font-family: inherit;
          outline: none;
          width: 100%;
          background: #fff;
          color: #20241F;
        }

        .fd-input:focus {
          border-color: #20241F;
        }

        .fd-submit {
          width: 100%;
          background: #20241F;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 13px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }

        .fd-submit:active {
          opacity: 0.85;
        }

        .fd-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 22px;
        }

        .fd-entry {
          background: #FFFFFF;
          border: 1px solid #DEDAD1;
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .fd-entry .icon {
          font-size: 18px;
        }

        .fd-entry .mid {
          flex: 1;
          min-width: 0;
        }

        .fd-entry .cat {
          font-size: 13px;
          font-weight: 600;
        }

        .fd-entry .desc {
          font-size: 12px;
          color: #6B6F68;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fd-entry .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
          margin-right: 5px;
        }

        .fd-entry .val {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 600;
          font-size: 14px;
        }

        .fd-entry .del {
          border: none;
          background: transparent;
          color: #B23B2E;
          cursor: pointer;
          font-size: 13px;
          padding: 4px 6px;
        }

        .fd-empty {
          color: #6B6F68;
          font-size: 13px;
          padding: 20px;
          text-align: center;
        }

        .fd-breakdown {
          background: #FFFFFF;
          border: 1px solid #DEDAD1;
          border-radius: 14px;
          padding: 14px;
          margin-bottom: 22px;
        }

        .fd-bd-row {
          margin-bottom: 10px;
        }

        .fd-bd-top {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 4px;
          gap: 10px;
        }

        .fd-bar-bg {
          background: #F0EEE9;
          border-radius: 999px;
          height: 6px;
          overflow: hidden;
        }

        .fd-bar-fill {
          background: #20241F;
          height: 100%;
          border-radius: 999px;
        }

        .fd-err {
          color: #B23B2E;
          font-size: 12px;
          margin-top: 6px;
        }

        @media (max-width: 640px) {
          .fd-root {
            padding: 18px 12px 60px;
          }

          .fd-title {
            font-size: 22px;
          }

          .fd-summary {
            grid-template-columns: 1fr;
          }

          .fd-cards-row {
            grid-template-columns: repeat(2, 1fr);
          }

          .fd-card {
            min-height: 78px;
          }

          .fd-row2,
          .fd-row3 {
            grid-template-columns: 1fr;
          }

          .fd-entry {
            align-items: flex-start;
          }

          .fd-entry .val {
            font-size: 13px;
          }
        }
      `}</style>

      <div className="fd-wrap">
        <div className="fd-header">
          <div className="fd-title fd-display">Minhas Finanças</div>

          <div className="fd-month">
            <button onClick={() => shiftMonth(-1)} aria-label="mês anterior">
              ‹
            </button>
            <span>{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} aria-label="próximo mês">
              ›
            </button>
          </div>
        </div>

        <div className="fd-summary">
          <div className="fd-sumcard">
            <div className="lbl">Salário</div>
            <input
              className="fd-salary-input"
              value={salaryInput}
              inputMode="decimal"
              placeholder="0,00"
              onChange={(e) => setSalaryInput(e.target.value)}
              onBlur={commitSalary}
            />
          </div>

          <div className="fd-sumcard">
            <div className="lbl">Gasto no mês</div>
            <div className="val fd-mono">{fmt(totalGasto)}</div>
          </div>

          <div className="fd-sumcard">
            <div className="lbl">Saldo</div>
            <div
              className={`val fd-mono ${
                saldo >= 0 ? "fd-saldo-pos" : "fd-saldo-neg"
              }`}
            >
              {fmt(saldo)}
            </div>
          </div>
        </div>

        <div className="fd-cards-row">
          <div
            className={`fd-card ${cardFilter === null ? "active" : ""}`}
            style={{
              background: "#FFFFFF",
              color: "#20241F",
              border:
                cardFilter === null
                  ? "2px solid #20241F"
                  : "1px solid #DEDAD1",
            }}
            onClick={() => setCardFilter(null)}
          >
            <div className="cname">Todos</div>
            <div className="cval">{fmt(totalGasto)}</div>
          </div>

          {CARDS.map((c) => (
            <div
              key={c.id}
              className={`fd-card ${cardFilter === c.id ? "active" : ""}`}
              style={{ background: c.color, color: c.text }}
              onClick={() => setCardFilter(cardFilter === c.id ? null : c.id)}
            >
              <div className="cname">{c.name}</div>
              <div className="cval">{fmt(perCard[c.id] || 0)}</div>
            </div>
          ))}
        </div>

        <div className="fd-section-title">Adicionar gasto</div>

        <div className="fd-form">
          <div className="fd-chips">
            {categories.map((c) => (
              <div
                key={c.id}
                className={`fd-chip ${form.categoryId === c.id ? "sel" : ""}`}
                onClick={() => setForm((f) => ({ ...f, categoryId: c.id }))}
              >
                <span>{c.icon}</span> {c.label}
              </div>
            ))}

            {!addingCat ? (
              <div className="fd-chip add" onClick={() => setAddingCat(true)}>
                + categoria
              </div>
            ) : (
              <input
                className="fd-cat-input"
                autoFocus
                placeholder="nome da categoria"
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                onBlur={addCategory}
              />
            )}
          </div>

          <div className="fd-pills">
            {CARDS.map((c) => (
              <div
                key={c.id}
                className={`fd-pill ${form.cardId === c.id ? "sel" : ""}`}
                style={{ background: c.color, color: c.text }}
                onClick={() => setForm((f) => ({ ...f, cardId: c.id }))}
              >
                {c.name}
              </div>
            ))}
          </div>

          <div className="fd-row2">
            <input
              className="fd-input"
              type="text"
              inputMode="decimal"
              placeholder="Valor (R$)"
              value={form.value}
              onChange={(e) =>
                setForm((f) => ({ ...f, value: e.target.value }))
              }
            />

            <input
              className="fd-input"
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm((f) => ({ ...f, date: e.target.value }))
              }
            />
          </div>

          <div className="fd-row3">
            <input
              className="fd-input"
              type="text"
              placeholder="Descrição (opcional)"
              value={form.desc}
              onChange={(e) =>
                setForm((f) => ({ ...f, desc: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
            />
          </div>

          <button className="fd-submit" onClick={addEntry}>
            Adicionar gasto
          </button>

          {saveError && (
            <div className="fd-err">
              Não consegui salvar agora. Tente de novo.
            </div>
          )}
        </div>

        {perCategory.length > 0 && (
          <>
            <div className="fd-section-title">Por categoria</div>

            <div className="fd-breakdown">
              {perCategory.map((row) => (
                <div className="fd-bd-row" key={row.id}>
                  <div className="fd-bd-top">
                    <span>
                      {row.cat ? `${row.cat.icon} ${row.cat.label}` : row.id}
                    </span>
                    <span className="fd-mono">{fmt(row.val)}</span>
                  </div>

                  <div className="fd-bar-bg">
                    <div
                      className="fd-bar-fill"
                      style={{
                        width: `${
                          totalGasto ? (row.val / totalGasto) * 100 : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="fd-section-title">
          Lançamentos{" "}
          {cardFilter
            ? `· ${CARDS.find((c) => c.id === cardFilter)?.name}`
            : ""}
        </div>

        <div className="fd-list">
          {filteredEntries.length === 0 && (
            <div className="fd-empty">
              Nenhum gasto lançado neste mês ainda.
            </div>
          )}

          {filteredEntries.map((e) => {
            const cat = categories.find((c) => c.id === e.categoryId);
            const card = CARDS.find((c) => c.id === e.cardId);

            return (
              <div className="fd-entry" key={e.id}>
                <div className="icon">{cat?.icon || "🏷️"}</div>

                <div className="mid">
                  <div className="cat">{cat?.label || e.categoryId}</div>

                  <div className="desc">
                    <span
                      className="dot"
                      style={{ background: card?.color }}
                    />
                    {card?.name} {e.desc && `· ${e.desc}`} ·{" "}
                    {e.date.split("-").reverse().join("/")}
                  </div>
                </div>

                <div className="val">{fmt(e.value)}</div>

                <button className="del" onClick={() => removeEntry(e.id)}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}