import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseKey) : null;

const CARDS = [
  { id: "nubank", name: "Nubank", short: "Nu", color: "#8A05BE", text: "#FFFFFF", icon: "◫" },
  { id: "picpay", name: "PicPay", short: "Pi", color: "#21C25E", text: "#071D12", icon: "◩" },
  { id: "santander", name: "Santander", short: "St", color: "#EC0000", text: "#FFFFFF", icon: "◭" },
  { id: "dinheiro", name: "Pix", short: "R$", color: "#313743", text: "#FFFFFF", icon: "◉" },
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

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const FULL_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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
  const normalized = String(value || "")
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");

  return parseFloat(normalized) || 0;
}

function formatDateBR(date) {
  if (!date) return "";
  return date.split("-").reverse().join("/");
}

function makeCategoryId(label) {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Date.now().toString(36).slice(-4)
  );
}

function fromDbEntry(row) {
  return {
    id: row.id,
    date: row.date,
    categoryId: row.category_id,
    cardId: row.card_id,
    value: Number(row.value) || 0,
    desc: row.description || "",
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [authLoaded, setAuthLoaded] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [session, setSession] = useState(null);

  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMsg, setAuthMsg] = useState("");

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
  const [listFilterCard, setListFilterCard] = useState(null);
  const [listSearch, setListSearch] = useState("");
  const [saveError, setSaveError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [profileImage, setProfileImage] = useState("");

  const user = session?.user || null;

  useEffect(() => {
    if (!user?.id) {
      setProfileImage("");
      return;
    }

    const savedImage = localStorage.getItem(`finance-profile-image-${user.id}`);
    setProfileImage(savedImage || "");
  }, [user?.id]);

  function handleProfileImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setSaveError("Escolha um arquivo de imagem válido.");
      return;
    }

    if (file.size > 1024 * 1024 * 2) {
      setSaveError("Escolha uma imagem de até 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result || "");
      setProfileImage(image);
      if (user?.id) {
        localStorage.setItem(`finance-profile-image-${user.id}`, image);
      }
      setSaveError("");
    };
    reader.readAsDataURL(file);
  }

  function removeProfileImage() {
    setProfileImage("");
    if (user?.id) {
      localStorage.removeItem(`finance-profile-image-${user.id}`);
    }
  }

  const loadData = useCallback(async (userId, options = {}) => {
    if (!supabase || !userId) return;

    try {
      if (!options.silent) setDataLoaded(false);
      setSaveError("");

      const { data: settingsData, error: settingsError } = await supabase
        .from("finance_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (settingsError) throw settingsError;

      if (settingsData) {
        const nextSalary = Number(settingsData.salary) || 0;
        const nextCategories =
          Array.isArray(settingsData.categories) && settingsData.categories.length > 0
            ? settingsData.categories
            : DEFAULT_CATEGORIES;

        setSalary(nextSalary);
        setSalaryInput(String(settingsData.salary ?? ""));
        setCategories(nextCategories);

        setForm((old) => ({
          ...old,
          categoryId: nextCategories.some((cat) => cat.id === old.categoryId)
            ? old.categoryId
            : nextCategories[0]?.id || "outros",
        }));
      } else {
        const { error: insertSettingsError } = await supabase.from("finance_settings").insert({
          user_id: userId,
          salary: 0,
          categories: DEFAULT_CATEGORIES,
        });

        if (insertSettingsError) throw insertSettingsError;

        setSalary(0);
        setSalaryInput("");
        setCategories(DEFAULT_CATEGORIES);
      }

      const { data: entriesData, error: entriesError } = await supabase
        .from("finance_entries")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (entriesError) throw entriesError;
      setEntries((entriesData || []).map(fromDbEntry));
    } catch (err) {
      console.error(err);
      setSaveError("Erro ao carregar dados do Supabase.");
    } finally {
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoaded(true);
      return undefined;
    }

    async function initAuth() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setAuthLoaded(true);
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setDataLoaded(false);
      return;
    }

    loadData(user.id);
  }, [user?.id, loadData]);

  useEffect(() => {
    if (!user) return undefined;

    function refreshOnFocus() {
      if (document.visibilityState === "visible") {
        loadData(user.id, { silent: true });
      }
    }

    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [user, loadData]);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthMsg("");

    if (!supabase) {
      setAuthMsg("Supabase não configurado.");
      return;
    }

    if (!authEmail || !authPassword) {
      setAuthMsg("Preencha e-mail e senha.");
      return;
    }

    if (authPassword.length < 6) {
      setAuthMsg("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });

        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });

        if (error) throw error;

        if (!data.session) {
          setAuthMsg("Conta criada. Confirme no seu e-mail e depois entre.");
        }
      }
    } catch (err) {
      console.error(err);
      setAuthMsg(err.message || "Erro ao entrar.");
    }
  }

  async function logout() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setEntries([]);
    setSalary(0);
    setSalaryInput("");
    setCategories(DEFAULT_CATEGORIES);
    setActiveTab("home");
  }

  async function saveSettings(nextSalary, nextCategories) {
    if (!supabase || !user) return;

    try {
      setSyncing(true);
      setSaveError("");

      const { error } = await supabase
        .from("finance_settings")
        .upsert(
          {
            user_id: user.id,
            salary: nextSalary,
            categories: nextCategories,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;
    } catch (err) {
      console.error(err);
      setSaveError("Não consegui salvar no Supabase.");
    } finally {
      setSyncing(false);
    }
  }

  function commitSalary() {
    const v = parseMoney(salaryInput);
    setSalary(v);
    setSalaryInput(v ? String(v).replace(".", ",") : "");
    saveSettings(v, categories);
  }

  async function addEntry() {
    if (!supabase || !user) return;

    const v = parseMoney(form.value);
    if (!v || v <= 0) {
      setSaveError("Digite um valor válido para o lançamento.");
      return;
    }

    try {
      setSyncing(true);
      setSaveError("");

      const { data, error } = await supabase
        .from("finance_entries")
        .insert({
          user_id: user.id,
          date: form.date,
          category_id: form.categoryId,
          card_id: form.cardId,
          value: v,
          description: form.desc.trim(),
        })
        .select("*")
        .single();

      if (error) throw error;

      setEntries((old) => [fromDbEntry(data), ...old]);
      setForm((f) => ({ ...f, value: "", desc: "" }));
      setActiveTab("home");
    } catch (err) {
      console.error(err);
      setSaveError("Não consegui salvar esse gasto.");
    } finally {
      setSyncing(false);
    }
  }

  async function removeEntry(id) {
    if (!supabase || !user) return;

    const oldEntries = entries;
    setEntries((old) => old.filter((e) => e.id !== id));

    try {
      setSaveError("");

      const { error } = await supabase
        .from("finance_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    } catch (err) {
      console.error(err);
      setEntries(oldEntries);
      setSaveError("Não consegui apagar esse gasto.");
    }
  }

  async function addCategory() {
    const label = newCatLabel.trim();

    if (!label) {
      setAddingCat(false);
      return;
    }

    const id = makeCategoryId(label);
    const next = [...categories, { id, label, icon: "🏷️" }];

    setCategories(next);
    setForm((f) => ({ ...f, categoryId: id }));
    setNewCatLabel("");
    setAddingCat(false);

    await saveSettings(salary, next);
  }

  const [year, month] = monthCursor.split("-").map(Number);
  const monthLabel = `${FULL_MONTHS[month - 1]} ${year}`;
  const shortMonthLabel = `${MONTHS[month - 1]} ${year}`;

  const monthEntries = useMemo(() => {
    return entries.filter((e) => e.date.startsWith(monthCursor));
  }, [entries, monthCursor]);

  const totalGasto = monthEntries.reduce((sum, entry) => sum + entry.value, 0);
  const saldo = salary - totalGasto;
  const usedPercent = salary > 0 ? Math.min(100, Math.round((totalGasto / salary) * 100)) : 0;
  const availablePercent = salary > 0 ? Math.max(0, Math.round((saldo / salary) * 100)) : 0;

  const perCard = useMemo(() => {
    const map = {};
    CARDS.forEach((card) => {
      map[card.id] = 0;
    });

    monthEntries.forEach((entry) => {
      map[entry.cardId] = (map[entry.cardId] || 0) + entry.value;
    });

    return map;
  }, [monthEntries]);

  const perCategory = useMemo(() => {
    const map = {};

    monthEntries.forEach((entry) => {
      map[entry.categoryId] = (map[entry.categoryId] || 0) + entry.value;
    });

    return Object.entries(map)
      .map(([id, val]) => ({
        id,
        val,
        cat: categories.find((c) => c.id === id),
      }))
      .sort((a, b) => b.val - a.val);
  }, [monthEntries, categories]);

  const latestEntries = monthEntries.slice(0, 5);

  const visibleEntries = useMemo(() => {
    const q = listSearch.trim().toLowerCase();

    return entries
      .filter((entry) => (listFilterCard ? entry.cardId === listFilterCard : true))
      .filter((entry) => {
        if (!q) return true;
        const category = categories.find((cat) => cat.id === entry.categoryId)?.label || "";
        const card = CARDS.find((c) => c.id === entry.cardId)?.name || "";
        return `${category} ${card} ${entry.desc} ${formatDateBR(entry.date)}`.toLowerCase().includes(q);
      });
  }, [entries, listFilterCard, listSearch, categories]);

  function shiftMonth(delta) {
    const [y, m] = monthCursor.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function selectTab(tab) {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderHeader() {
    return (
      <header className="app-header">
        <div>
          <div className="app-eyebrow">Controle financeiro</div>
          <h1>Olá, Deyvid🥷🏿 </h1> <br></br>
          <p>{syncing ? "Salvando alterações..." : "Suas finanças sincronizadas em todos os dispositivos."}</p>
        </div>

        <div className="header-actions">
          <div className="month-switcher">
            <button onClick={() => shiftMonth(-1)} aria-label="Mês anterior">‹</button>
            <span>{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} aria-label="Próximo mês">›</button>
          </div>
          <button className="icon-btn" onClick={() => loadData(user.id, { silent: true })} title="Atualizar">
            ↻
          </button>
        </div>
      </header>
    );
  }

  function renderSummary() {
    return (
      <section className="summary-panel">
        <div className="section-head">
          <div>
            <h2>Resumo do mês</h2>
            <p>Visão geral de {shortMonthLabel}</p>
          </div>
          <button className="ghost-btn" onClick={() => setActiveTab("profile")}>✎ Editar salário</button>
        </div>

        <div className="summary-grid">
          <div className="summary-card purple">
            <span>Salário</span>
            <strong>{fmt(salary)}</strong>
            <em>Carteira</em>
          </div>
          <div className="summary-card red">
            <span>Gastos</span>
            <strong>{fmt(totalGasto)}</strong>
            <em>Saídas</em>
          </div>
          <div className="summary-card green">
            <span>Saldo</span>
            <strong>{fmt(saldo)}</strong>
            <em>Disponível</em>
          </div>
        </div>

        <div className="balance-strip">
          <div className="ring" style={{ "--pct": `${availablePercent}%` }}>
            <span>{availablePercent}%</span>
          </div>
          <div>
            <span>Saldo disponível</span>
            <strong className={saldo >= 0 ? "positive" : "negative"}>{fmt(saldo)}</strong>
            <p>{saldo >= 0 ? "Excelente! Continue assim 🚀" : "Atenção: gastos acima do salário."}</p>
          </div>
        </div>
      </section>
    );
  }

  function renderCardsOverview({ clickable = true } = {}) {
    return (
      <section className="bank-grid">
        {CARDS.map((card) => (
          <button
            key={card.id}
            className={`bank-card ${card.id} ${cardFilter === card.id ? "active" : ""}`}
            onClick={() => clickable && setCardFilter(cardFilter === card.id ? null : card.id)}
            type="button"
          >
            <span className="bank-icon" style={{ background: card.color, color: card.text }}>{card.icon}</span>
            <span>{card.name}</span>
            <strong>{fmt(perCard[card.id] || 0)}</strong>
          </button>
        ))}
      </section>
    );
  }

  function renderEntryForm({ title = "Novo lançamento", subtitle = "Registre uma nova despesa" } = {}) {
    return (
      <section className="form-panel form-panel-centered">
        <div className="section-head">
          <div className="section-title-icon">▣</div>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>

        <div className="chips-row">
          {categories.map((category) => (
            <button
              key={category.id}
              className={`chip ${form.categoryId === category.id ? "sel" : ""}`}
              onClick={() => setForm((old) => ({ ...old, categoryId: category.id }))}
              type="button"
            >
              <span>{category.icon}</span> {category.label}
            </button>
          ))}

          {!addingCat ? (
            <button className="chip add" onClick={() => setAddingCat(true)} type="button">+ categoria</button>
          ) : (
            <input
              className="chip-input"
              autoFocus
              placeholder="nova categoria"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              onBlur={addCategory}
            />
          )}
        </div>

        <div className="pills-row">
          {CARDS.map((card) => (
            <button
              key={card.id}
              className={`pill ${form.cardId === card.id ? "sel" : ""}`}
              style={{ "--pill": card.color }}
              onClick={() => setForm((old) => ({ ...old, cardId: card.id }))}
              type="button"
            >
              {card.name}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>
            <span>Valor</span>
            <input
              className="app-input"
              type="text"
              inputMode="decimal"
              placeholder="Ex: 25,90"
              value={form.value}
              onChange={(e) => setForm((old) => ({ ...old, value: e.target.value }))}
            />
          </label>

          <label>
            <span>Data</span>
            <input
              className="app-input"
              type="date"
              value={form.date}
              onChange={(e) => setForm((old) => ({ ...old, date: e.target.value }))}
            />
          </label>
        </div>

        <label>
          <span>Descrição opcional</span>
          <input
            className="app-input"
            type="text"
            placeholder="Ex: almoço, uber, mercado..."
            value={form.desc}
            onChange={(e) => setForm((old) => ({ ...old, desc: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
        </label>

        <button className="primary-btn" onClick={addEntry} disabled={syncing} type="button">
          + {syncing ? "Salvando..." : "Registrar lançamento"}
        </button>

        {saveError && <div className="error-box">{saveError}</div>}
      </section>
    );
  }

  function renderTransactionItem(entry) {
    const category = categories.find((cat) => cat.id === entry.categoryId);
    const card = CARDS.find((c) => c.id === entry.cardId);

    return (
      <div className="transaction" key={entry.id}>
        <div className="transaction-icon">{category?.icon || "🏷️"}</div>
        <div className="transaction-main">
          <strong>{category?.label || entry.categoryId}</strong>
          <span>
            <i style={{ background: card?.color || "#888" }} />
            {card?.name || entry.cardId} {entry.desc ? `· ${entry.desc}` : ""} · {formatDateBR(entry.date)}
          </span>
        </div>
        <div className="transaction-value">{fmt(entry.value)}</div>
        <button className="delete-btn" onClick={() => removeEntry(entry.id)} type="button">×</button>
      </div>
    );
  }

  function renderLatest() {
    return (
      <section className="content-card">
        <div className="section-head">
          <div>
            <h2>Últimas transações</h2>
            <p>{latestEntries.length ? "Lançamentos recentes deste mês" : "Nenhuma transação lançada neste mês ainda."}</p>
          </div>
          <button className="text-btn" onClick={() => selectTab("transactions")}>Ver todas ›</button>
        </div>

        <div className="transactions-list">
          {latestEntries.length === 0 ? (
            <div className="empty-state">
              <div>☷</div>
              <strong>Nenhuma transação ainda</strong>
              <span>Que tal registrar sua primeira despesa?</span>
            </div>
          ) : (
            latestEntries.map(renderTransactionItem)
          )}
        </div>
      </section>
    );
  }

  function renderCategoryBreakdown({ compact = false } = {}) {
    return (
      <section className="content-card">
        <div className="section-head">
          <div style={{ textAlign: 'center', width: '100%' }}>
            <h2>Gastos por categoria</h2>
            <p>{perCategory.length ? "Onde seu dinheiro foi neste mês"  : "Os gastos por categoria aparecerão aqui."}</p>
            <br />
          </div>
        </div>

        {perCategory.length === 0 ? (
          <div className="empty-state small">
            <div>◔</div>
            <strong>Nenhum gasto registrado</strong>
            <span>Os relatórios aparecem depois do primeiro lançamento.</span>
          </div>
        ) : (
          <div className="breakdown-list">
            {perCategory.slice(0, compact ? 4 : perCategory.length).map((row) => {
              const pct = totalGasto ? Math.round((row.val / totalGasto) * 100) : 0;
              return (
                <div className="breakdown-row" key={row.id}>
                  <div className="breakdown-top">
                    <span>{row.cat ? `${row.cat.icon} ${row.cat.label}` : row.id}</span>
                    <strong>{fmt(row.val)}</strong>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <small>{pct}% dos gastos do mês</small>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function renderHome() {
    return (
      <>
        {renderHeader()}
        {renderSummary()}
        {renderCardsOverview()}
        <div className="home-grid">
          {renderEntryForm({ title: "Novo lançamento", subtitle: "Registre uma nova despesa rapidamente" })}
          <div className="home-side">
            {renderLatest()}
            {renderCategoryBreakdown({ compact: true })}
          </div>
        </div>
      </>
    );
  }

  function renderTransactions() {
    return (
      <>
        <section className="page-title-card page-title-centered">
          <div>
            <span>Lançamentos</span>
            <h2>Histórico de gastos</h2>
            <p>Consulte, filtre e apague seus lançamentos.</p>
          </div>
          <button className="primary-mini" onClick={() => selectTab("new")}>+ Novo</button>
        </section>

        <section className="filter-card">
          <input
            className="app-input"
            type="text"
            placeholder="Buscar por descrição, categoria ou cartão..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />

          <div className="pills-row no-margin">
            <button className={`pill neutral ${!listFilterCard ? "sel" : ""}`} onClick={() => setListFilterCard(null)} type="button">Todos</button>
            {CARDS.map((card) => (
              <button
                key={card.id}
                className={`pill ${listFilterCard === card.id ? "sel" : ""}`}
                style={{ "--pill": card.color }}
                onClick={() => setListFilterCard(listFilterCard === card.id ? null : card.id)}
                type="button"
              >
                {card.name}
              </button>
            ))}
          </div>
        </section>

        <section className="content-card">
          <div className="section-head">
            <div>
              <h2>Todos os lançamentos</h2>
              <p>{visibleEntries.length} registro(s) encontrado(s)</p>
            </div>
          </div>

          <div className="transactions-list">
            {visibleEntries.length === 0 ? (
              <div className="empty-state">
                <div>☷</div>
                <strong>Nenhum lançamento encontrado</strong>
                <span>Tente mudar o filtro ou registre um novo gasto.</span>
              </div>
            ) : (
              visibleEntries.map(renderTransactionItem)
            )}
          </div>
        </section>
      </>
    );
  }

  function renderReports() {
    return (
      <>
        <section className="page-title-card">
          <div style={{ textAlign: 'center', width: '100%' }}>
            <span> Relatórios</span>
            <h2>Análise do mês</h2>
            <p>Resumo visual para entender seus gastos em {shortMonthLabel}.</p>
          </div>
        </section>

        <section className="report-grid">
          <div className="report-card big">
            <span>Uso do salário</span>
            <div className="large-ring" style={{ "--pct": `${usedPercent}%` }}>
              <strong>{usedPercent}%</strong>
            </div>
            <p>{fmt(totalGasto)} gastos de {fmt(salary)} disponíveis</p>
          </div>

          <div className="report-card">
            <span>Maior categoria</span>
            <strong>{perCategory[0]?.cat?.label || "Sem dados"}</strong>
            <p>{perCategory[0] ? fmt(perCategory[0].val) : "Lance um gasto para aparecer aqui."}</p>
          </div>

          <div className="report-card">
            <span>Maior cartão</span>
            <strong>
              {CARDS.map((card) => ({ ...card, total: perCard[card.id] || 0 })).sort((a, b) => b.total - a.total)[0]?.name || "Sem dados"}
            </strong>
            <p>
              {fmt(CARDS.map((card) => perCard[card.id] || 0).sort((a, b) => b - a)[0] || 0)}
            </p>
          </div>
        </section>

        {renderCategoryBreakdown()}

        <section className="content-card">
          <div className="section-head">
            <div style={{ textAlign: 'center', width: '100%' }} >
              <h2>Gastos por cartão</h2>
              <p>Comparativo dos meios de pagamento</p>
              <br />
            </div>
          </div>
          <div className="breakdown-list">
            {CARDS.map((card) => {
              const val = perCard[card.id] || 0;
              const pct = totalGasto ? Math.round((val / totalGasto) * 100) : 0;
              return (
                <div className="breakdown-row" key={card.id}>
                  <div className="breakdown-top">
                    <span><i className="legend-dot" style={{ background: card.color }} /> {card.name}</span>
                    <strong>{fmt(val)}</strong>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: card.color }} />
                  </div>
                  <small>{pct}% dos gastos</small>
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  }

  function renderProfile() {
    return (
      <>
        <section className="page-title-card profile-head">
          <div className="profile-cover">
            <label className="avatar avatar-upload" title="Alterar foto de perfil">
              {profileImage ? (
                <img src={profileImage} alt="Foto de perfil" />
              ) : (
                <span>{(user?.email || "D").slice(0, 1).toUpperCase()}</span>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleProfileImageChange}
                aria-label="Alterar foto de perfil"
              />
              <em>Trocar</em>
            </label>

            <div className="profile-title">
              <span>Perfil</span>
              <h2>Sua conta</h2>
              <p>Gerencie sua sessão e configurações principais.</p>
            </div>

            {profileImage && (
              <button className="avatar-remove" onClick={removeProfileImage} type="button">
                Remover foto
              </button>
            )}
          </div>
        </section>

        <section className="content-card profile-card">
          <div className="profile-row">
            <span>E-mail conectado</span>
            <strong>{user?.email}</strong>
          </div>
          <div className="profile-row">
            <span>Status</span>
            <strong className="online-dot">Online e sincronizado</strong>
          </div>
          <div className="profile-row input-row">
            <div>
              <span>Salário mensal</span>
              <p>Esse valor entra no cálculo do saldo e relatórios.</p>
            </div>
            <input
              className="app-input salary-profile"
              value={salaryInput}
              inputMode="decimal"
              placeholder="R$ 0,00"
              onChange={(e) => setSalaryInput(e.target.value)}
              onBlur={commitSalary}
            />
          </div>
          <button className="primary-btn" onClick={commitSalary}>Salvar salário</button>
          <button className="danger-btn" onClick={logout}>Sair da conta</button>
          {saveError && <div className="error-box">{saveError}</div>}
        </section>
      </>
    );
  }

  function renderActiveTab() { 
    if (activeTab === "transactions") return renderTransactions();
    if (activeTab === "new") return renderEntryForm({ title: "Novo lançamento", subtitle: "Cadastre um gasto com categoria, cartão e descrição." });
    if (activeTab === "reports") return renderReports();
    if (activeTab === "profile") return renderProfile();
    return renderHome();
  }

  if (!hasSupabaseConfig) {
    return (
      <div className="app-shell auth-only">
        <style>{baseCss}</style>
        <div className="auth-card">
          <h1>Configuração incompleta</h1>
          <p>Confira o arquivo .env e reinicie o Vite com npm run dev.</p>
        </div>
      </div>
    );
  }

  if (!authLoaded) {
    return (
      <div className="app-shell auth-only">
        <style>{baseCss}</style>
        <div className="loading-card">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell auth-only">
        <style>{baseCss}</style>
        <section className="auth-card">
          <div className="auth-logo">◈</div>
          <h1>Minhas Finanças</h1>
          <p>Entre na sua conta para sincronizar PC e iPhone.</p>

          <form onSubmit={handleAuth}>
            <input
              className="app-input"
              type="email"
              placeholder="Seu e-mail"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />
            <input
              className="app-input"
              type="password"
              placeholder="Senha"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
            <button className="primary-btn" type="submit">
              {authMode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button
            className="text-btn center"
            onClick={() => {
              setAuthMode(authMode === "login" ? "signup" : "login");
              setAuthMsg("");
            }}
            type="button"
          >
            {authMode === "login" ? "Não tenho conta, quero criar" : "Já tenho conta, quero entrar"}
          </button>

          {authMsg && <div className="error-box">{authMsg}</div>}
        </section>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div className="app-shell auth-only">
        <style>{baseCss}</style>
        <div className="loading-card">Sincronizando dados...</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <style>{baseCss}</style>

      <main className="app-main">
        {renderActiveTab()}
      </main>

      <nav className="app-nav" aria-label="Navegação principal">
        <button className={activeTab === "home" ? "active" : ""} onClick={() => selectTab("home")} type="button">
          <span>⌂</span> Início
        </button>
        <button className={activeTab === "transactions" ? "active" : ""} onClick={() => selectTab("transactions")} type="button">
          <span>☷</span> Lançamentos
        </button>
        <button className={`nav-new ${activeTab === "new" ? "active" : ""}`} onClick={() => selectTab("new")} type="button">
          <span>＋</span> Novo
        </button>
        <button className={activeTab === "reports" ? "active" : ""} onClick={() => selectTab("reports")} type="button">
          <span>▥</span> Relatórios
        </button>
        <button className={activeTab === "profile" ? "active" : ""} onClick={() => selectTab("profile")} type="button">
          <span>○</span> Perfil
        </button>
      </nav>
    </div>
  );
}

const baseCss = `
  :root {
    --bg: #070b14;
    --bg2: #101522;
    --panel: rgba(17, 23, 37, 0.82);
    --panel2: rgba(28, 33, 48, 0.72);
    --line: rgba(255, 255, 255, 0.08);
    --line2: rgba(255, 255, 255, 0.14);
    --text: #f5f7fb;
    --muted: #a8b0c2;
    --muted2: #687084;
    --purple: #8b5cf6;
    --purple2: #6d28d9;
    --green: #22c55e;
    --red: #f43f5e;
    --yellow: #fbbf24;
    --shadow: 0 24px 80px rgba(0, 0, 0, 0.36);
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  html, body, #root {
    margin: 0;
    min-height: 100%;
  }

  body {
    background:
      radial-gradient(circle at 15% 0%, rgba(139, 92, 246, 0.20), transparent 28%),
      radial-gradient(circle at 85% 10%, rgba(34, 197, 94, 0.10), transparent 25%),
      linear-gradient(145deg, #070b14 0%, #0b101b 50%, #05070d 100%);
    color: var(--text);
  }

  button, input {
    font: inherit;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  .app-shell {
    min-height: 100vh;
    padding: 28px 20px 112px;
    position: relative;
  }

  .app-shell::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0));
  }

  .app-main {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
    position: relative;
    z-index: 1;
  }

  .auth-only {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-bottom: 28px;
  }

  .loading-card,
  .auth-card,
  .summary-panel,
  .form-panel,
  .content-card,
  .page-title-card,
  .filter-card,
  .report-card {
    background: linear-gradient(145deg, rgba(22, 29, 47, 0.86), rgba(13, 18, 31, 0.78));
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .loading-card {
    border-radius: 24px;
    padding: 24px 28px;
    color: var(--muted);
    font-weight: 700;
  }

  .auth-card {
    width: min(420px, 100%);
    border-radius: 30px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }

  .auth-logo {
    width: 58px;
    height: 58px;
    margin: 0 auto 4px;
    display: grid;
    place-items: center;
    border-radius: 20px;
    background: linear-gradient(135deg, var(--purple), var(--green));
    box-shadow: 0 18px 44px rgba(139, 92, 246, 0.28);
    font-size: 28px;
  }

  .auth-card h1,
  .app-header h1,
  .section-head h2,
  .page-title-card h2 {
    margin: 0;
    letter-spacing: -0.04em;
  }

  .auth-card p,
  .app-header p,
  .section-head p,
  .page-title-card p,
  .report-card p,
  .profile-row p {
    margin: 4px 0 0;
    color: var(--muted);
  }

  .auth-card form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
  }

  .app-eyebrow,
  .page-title-card span:first-child {
    color: var(--purple);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .app-header h1 {
    font-size: clamp(30px, 5vw, 48px);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .month-switcher,
  .app-nav,
  .bank-card,
  .chip,
  .pill,
  .ghost-btn,
  .icon-btn,
  .mini-select,
  .primary-mini {
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 18px;
  }

  .month-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
  }

  .month-switcher button {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
    cursor: pointer;
    font-size: 20px;
  }

  .month-switcher span {
    min-width: 142px;
    text-align: center;
    font-weight: 800;
    color: #dfe4ef;
  }

  .icon-btn {
    width: 46px;
    height: 46px;
    cursor: pointer;
    font-size: 20px;
  }

  .summary-panel {
    border-radius: 30px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
  }

  .section-head h2 {
    font-size: 22px;
  }

  .ghost-btn,
  .text-btn,
  .primary-mini {
    cursor: pointer;
  }

  .ghost-btn {
    padding: 11px 14px;
    font-weight: 800;
  }

  .text-btn {
    border: 0;
    background: transparent;
    color: #c084fc;
    font-weight: 900;
    white-space: nowrap;
  }

  .text-btn.center {
    align-self: center;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .summary-card {
    min-height: 132px;
    border-radius: 24px;
    padding: 20px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.045);
    position: relative;
    overflow: hidden;
  }

  .summary-card::after {
    content: attr(data-icon);
    position: absolute;
    right: 18px;
    bottom: 16px;
    width: 54px;
    height: 54px;
    border-radius: 18px;
    opacity: 0.28;
  }

  .summary-card span,
  .report-card span,
  .profile-row span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: clamp(22px, 4vw, 32px);
    letter-spacing: -0.05em;
  }

  .summary-card em {
    position: absolute;
    right: 18px;
    bottom: 16px;
    font-size: 13px;
    color: rgba(255,255,255,0.25);
    font-style: normal;
    font-weight: 900;
  }

  .summary-card.purple strong { color: #a78bfa; }
  .summary-card.red strong { color: var(--red); }
  .summary-card.green strong { color: var(--green); }

  .balance-strip {
    border-radius: 24px;
    padding: 18px;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 22px;
  }

  .ring,
  .large-ring {
    --pct: 0%;
    border-radius: 999px;
    background: conic-gradient(var(--green) var(--pct), rgba(255,255,255,0.08) 0);
    display: grid;
    place-items: center;
    position: relative;
    flex: 0 0 auto;
  }

  .ring {
    width: 96px;
    height: 96px;
  }

  .ring::before,
  .large-ring::before {
    content: "";
    position: absolute;
    inset: 10px;
    background: #101725;
    border-radius: inherit;
  }

  .ring span,
  .large-ring strong {
    position: relative;
    z-index: 1;
    font-weight: 1000;
    font-size: 22px;
  }

  .balance-strip div:last-child span {
    color: var(--muted);
    font-weight: 800;
  }

  .balance-strip div:last-child strong {
    display: block;
    margin: 6px 0 2px;
    font-size: clamp(28px, 6vw, 44px);
    letter-spacing: -0.06em;
  }

  .positive { color: var(--green); }
  .negative { color: var(--red); }

  .bank-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .bank-card {
    padding: 18px;
    min-height: 110px;
    text-align: left;
    cursor: pointer;
    display: grid;
    grid-template-columns: 42px 1fr;
    grid-template-rows: auto auto;
    column-gap: 12px;
    row-gap: 6px;
    align-items: center;
    transition: 0.2s ease;
  }

  .bank-card:hover,
  .bank-card.active {
    transform: translateY(-3px);
    border-color: var(--line2);
    box-shadow: 0 18px 44px rgba(0,0,0,0.28);
  }

  .bank-icon {
    grid-row: 1 / span 2;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    font-weight: 1000;
  }

  .bank-card span:nth-child(2) {
    font-weight: 900;
  }

  .bank-card strong {
    color: var(--muted);
    font-size: 14px;
  }

  .home-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.18fr) minmax(340px, 0.82fr);
    gap: 18px;
    align-items: start;
  }

  .home-side {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-panel,
  .content-card,
  .page-title-card,
  .filter-card {
    border-radius: 30px;
    padding: 22px;
  }

  .form-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-title-icon {
    width: 54px;
    height: 54px;
    border-radius: 18px;
    display: grid;
    place-items: center;
    background: rgba(139, 92, 246, 0.18);
    color: #c4b5fd;
    font-size: 28px;
    flex: 0 0 auto;
  }

  .chips-row,
  .pills-row {
    display: flex;
    gap: 9px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .chips-row::-webkit-scrollbar,
  .pills-row::-webkit-scrollbar {
    display: none;
  }

  .chip,
  .pill {
    white-space: nowrap;
    padding: 10px 13px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
  }

  .chip.sel,
  .pill.sel {
    background: rgba(139, 92, 246, 0.18);
    border-color: rgba(167, 139, 250, 0.45);
    color: #f5f3ff;
  }

  .pill.sel {
    box-shadow: inset 0 -2px 0 var(--pill);
  }

  .chip.add {
    border-style: dashed;
    color: #c4b5fd;
  }

  .chip-input,
  .app-input {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 16px;
    outline: none;
  }

  .chip-input {
    min-width: 160px;
    padding: 10px 13px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  label span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    font-weight: 800;
    margin-bottom: 7px;
  }

  .app-input {
    width: 100%;
    padding: 15px 16px;
    font-size: 16px;
  }

  .app-input:focus,
  .chip-input:focus {
    border-color: rgba(167, 139, 250, 0.55);
    box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.10);
  }

  .primary-btn,
  .danger-btn,
  .primary-mini {
    border: 0;
    cursor: pointer;
    font-weight: 1000;
  }

  .primary-btn {
    width: 100%;
    padding: 16px 18px;
    border-radius: 18px;
    background: linear-gradient(135deg, #7c3aed, #6d28d9 58%, #4f46e5);
    color: #fff;
    box-shadow: 0 16px 40px rgba(124, 58, 237, 0.28);
  }

  .primary-btn:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .danger-btn {
    width: 100%;
    padding: 15px 18px;
    border-radius: 18px;
    background: rgba(244, 63, 94, 0.12);
    color: #fecdd3;
    border: 1px solid rgba(244, 63, 94, 0.22);
  }

  .error-box {
    padding: 13px 14px;
    border-radius: 16px;
    background: rgba(244, 63, 94, 0.12);
    border: 1px solid rgba(244, 63, 94, 0.22);
    color: #fecdd3;
    font-size: 14px;
    font-weight: 700;
  }

  .transactions-list,
  .breakdown-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .transaction {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto 38px;
    align-items: center;
    gap: 12px;
    padding: 13px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line);
  }

  .transaction-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.06);
    font-size: 20px;
  }

  .transaction-main {
    min-width: 0;
  }

  .transaction-main strong {
    display: block;
  }

  .transaction-main span {
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    margin-top: 3px;
  }

  .transaction-main i,
  .legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    margin-right: 6px;
  }

  .transaction-value {
    font-weight: 1000;
    white-space: nowrap;
  }

  .delete-btn {
    width: 36px;
    height: 36px;
    border-radius: 13px;
    border: 1px solid rgba(244, 63, 94, 0.20);
    background: rgba(244, 63, 94, 0.10);
    color: #fb7185;
    cursor: pointer;
    font-size: 20px;
  }

  .empty-state {
    min-height: 142px;
    display: grid;
    place-items: center;
    text-align: center;
    gap: 6px;
    padding: 20px;
    color: var(--muted);
    border-radius: 22px;
    background: rgba(0,0,0,0.18);
    border: 1px dashed var(--line);
  }

  .empty-state div {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: rgba(139, 92, 246, 0.14);
    color: #c4b5fd;
    font-size: 26px;
  }

  .empty-state strong {
    color: var(--text);
  }

  .empty-state.small {
    min-height: 120px;
  }

  .breakdown-row {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 14px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--line);
  }

  .breakdown-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .bar-bg {
    height: 9px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.07);
  }

  .bar-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #8b5cf6, #22c55e);
  }

  .breakdown-row small {
    color: var(--muted2);
    font-weight: 800;
  }

  .mini-select {
    color: var(--muted);
    font-size: 13px;
    padding: 9px 12px;
  }

  .page-title-card {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }

  .page-title-card h2 {
    font-size: clamp(26px, 4vw, 38px);
  }

  .primary-mini {
    padding: 12px 16px;
    background: rgba(139, 92, 246, 0.18);
    color: #ddd6fe;
  }

  .filter-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .no-margin {
    margin: 0;
  }

  .pill.neutral.sel {
    box-shadow: none;
  }

  .report-grid {
    display: grid;
    grid-template-columns: 1.1fr 0.95fr 0.95fr;
    gap: 16px;
  }

  .report-card {
    border-radius: 30px;
    padding: 22px;
    min-height: 190px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .report-card strong {
    font-size: 26px;
    letter-spacing: -0.04em;
  }

  .large-ring {
    width: 132px;
    height: 132px;
    margin: 8px auto;
  }

  .profile-head {
    align-items: center;
  }

  .avatar {
    width: 76px;
    height: 76px;
    border-radius: 28px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--purple), var(--green));
    font-size: 32px;
    font-weight: 1000;
  }

  .profile-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .profile-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 16px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--line);
  }

  .profile-row strong {
    text-align: right;
  }

  .online-dot::before {
    content: "";
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 8px;
    border-radius: 999px;
    background: var(--green);
    box-shadow: 0 0 12px var(--green);
  }

  .input-row {
    align-items: flex-start;
  }

  .salary-profile {
    max-width: 240px;
  }

  .app-nav {
    position: fixed;
    z-index: 10;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    width: min(760px, calc(100% - 28px));
    padding: 10px;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.46);
  }

  .app-nav button {
    border: 0;
    border-radius: 18px;
    color: var(--muted);
    background: transparent;
    padding: 10px 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .app-nav button span {
    font-size: 22px;
  }

  .app-nav button.active {
    color: #c4b5fd;
    background: rgba(139, 92, 246, 0.14);
  }

  .app-nav .nav-new {
    color: #fff;
  }

  .app-nav .nav-new span {
    width: 48px;
    height: 48px;
    margin-top: -24px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    box-shadow: 0 14px 34px rgba(139, 92, 246, 0.36);
  }

  @media (max-width: 980px) {
    .home-grid,
    .report-grid {
      grid-template-columns: 1fr;
    }

    .bank-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .app-shell {
      padding: 22px 14px 112px;
    }

    .app-header {
      flex-direction: column;
    }

    .header-actions {
      width: 100%;
      justify-content: space-between;
    }

    .month-switcher {
      flex: 1;
      justify-content: space-between;
    }

    .summary-grid,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .summary-panel,
    .form-panel,
    .content-card,
    .page-title-card,
    .filter-card {
      border-radius: 24px;
      padding: 18px;
    }

    .section-head {
      align-items: flex-start;
    }

    .balance-strip {
      align-items: flex-start;
    }

    .transaction {
      grid-template-columns: 44px minmax(0, 1fr) auto;
    }

    .transaction-icon {
      width: 44px;
      height: 44px;
    }

    .delete-btn {
      grid-column: 3;
      grid-row: 2;
      justify-self: end;
      width: 34px;
      height: 34px;
    }

    .transaction-value {
      align-self: start;
    }

    .profile-row,
    .input-row {
      flex-direction: column;
      align-items: stretch;
    }

    .profile-row strong {
      text-align: left;
    }

    .salary-profile {
      max-width: none;
    }
  }

  @media (max-width: 420px) {
    .app-shell {
      padding-left: 10px;
      padding-right: 10px;
    }

    .bank-grid {
      gap: 10px;
    }

    .bank-card {
      grid-template-columns: 1fr;
      min-height: 126px;
    }

    .bank-icon {
      grid-row: auto;
    }

    .app-nav {
      width: calc(100% - 14px);
      bottom: 10px;
      gap: 2px;
    }

    .app-nav button {
      font-size: 10px;
      padding: 8px 3px;
    }
  }


  /* ===== AJUSTE DESKTOP PROFISSIONAL =====
     No PC vira painel central com menu lateral.
     No celular continua com barra inferior tipo app. */
  @media (min-width: 900px) {
    .app-shell {
      padding: 34px 44px 44px 292px;
    }

    .app-main {
      width: min(1240px, 100%);
      margin: 0 auto;
      gap: 24px;
    }

    .app-nav {
      left: 28px;
      top: 50%;
      bottom: auto;
      transform: translateY(-50%);
      width: 230px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-radius: 30px;
      background: linear-gradient(145deg, rgba(22, 29, 47, 0.92), rgba(13, 18, 31, 0.86));
      border: 1px solid var(--line);
    }

    .app-nav::before {
      content: "Menu";
      display: block;
      padding: 8px 12px 12px;
      color: var(--muted2);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .app-nav button {
      width: 100%;
      min-height: 48px;
      flex-direction: row;
      justify-content: flex-start;
      gap: 12px;
      border-radius: 16px;
      padding: 12px 14px;
      font-size: 14px;
      text-align: left;
    }

    .app-nav button span {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      font-size: 20px;
    }

    .app-nav .nav-new span {
      width: 32px;
      height: 32px;
      margin-top: 0;
      box-shadow: 0 10px 26px rgba(139, 92, 246, 0.30);
    }

    .app-nav button.active {
      background: rgba(139, 92, 246, 0.18);
      color: #ffffff;
    }

    .app-header {
      align-items: center;
    }

    .summary-panel,
    .form-panel,
    .content-card,
    .page-title-card,
    .filter-card,
    .report-card {
      border-radius: 30px;
    }
  }


  /* ===== AJUSTES FINOS SOLICITADOS ===== */
  html,
  body,
  #root {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .app-shell,
  .app-main {
    max-width: 100%;
    overflow-x: hidden;
  }

  .profile-head {
    justify-content: center;
    text-align: center;
  }

  .profile-cover {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .profile-title span {
    display: block;
    color: var(--purple);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    margin-bottom: 8px;
  }

  .profile-title h2 {
    margin: 0;
  }

  .avatar.avatar-upload {
    position: relative;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
  }

  .avatar.avatar-upload input {
    display: none;
  }

  .avatar.avatar-upload img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .avatar.avatar-upload > span {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
  }

  .avatar.avatar-upload em {
    position: absolute;
    inset-inline: 8px;
    bottom: 8px;
    padding: 5px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.58);
    color: #fff;
    font-size: 11px;
    font-style: normal;
    font-weight: 900;
    opacity: 0;
    transform: translateY(6px);
    transition: 0.18s ease;
  }

  .avatar.avatar-upload:hover em,
  .avatar.avatar-upload:focus-within em {
    opacity: 1;
    transform: translateY(0);
  }

  .avatar-remove {
    border: 1px solid rgba(255, 255, 255, 0.10);
    background: rgba(255, 255, 255, 0.05);
    color: var(--muted);
    border-radius: 999px;
    padding: 9px 13px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
  }

  .chips-row {
    width: 100%;
    max-width: 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
  }

  .chip {
    flex: 0 0 auto;
    scroll-snap-align: start;
  }

  .pills-row {
    align-items: center;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  @media (max-width: 720px) {
    .profile-head {
      padding-top: 30px;
    }

    .profile-cover {
      gap: 18px;
    }

    .profile-cover .avatar {
      width: 112px;
      height: 112px;
      border-radius: 34px;
      order: 1;
    }

    .profile-title {
      order: 2;
    }

    .avatar-remove {
      order: 3;
    }

    .form-panel .section-head {
      align-items: center;
      text-align: center;
    }

    .form-panel .section-head > div:last-child {
      flex: 1;
    }

    .form-panel .chips-row {
      padding-inline: 0;
      margin-inline: 0;
    }

    .form-panel .chip {
      min-height: 42px;
    }

    .form-panel .pills-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      overflow: visible;
      padding-bottom: 0;
    }

    .form-panel .pills-row .pill {
      width: 100%;
      min-width: 0;
      padding: 12px 6px;
      font-size: clamp(11px, 3.1vw, 13px);
    }

    .filter-card .pills-row.no-margin {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 7px;
      overflow: visible;
      padding-bottom: 0;
    }

    .filter-card .pills-row.no-margin .pill {
      width: 100%;
      min-width: 0;
      padding: 11px 3px;
      font-size: clamp(9px, 2.65vw, 12px);
      letter-spacing: -0.02em;
    }
  }

  @media (max-width: 390px) {
    .filter-card .pills-row.no-margin {
      gap: 5px;
    }

    .filter-card .pills-row.no-margin .pill {
      font-size: 9.8px;
      padding-inline: 2px;
    }
  }


  /* ===== AJUSTES PEDIDOS: ALTURA DOS CARDS E TÍTULOS CENTRALIZADOS ===== */

  @media (min-width: 981px) {
    .home-grid {
      align-items: stretch;
    }

    .home-grid > .form-panel {
      height: 100%;
      min-height: 100%;
    }

    .home-grid > .home-side {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .home-side .content-card {
      flex: 1;
    }
  }

  .page-title-card.page-title-centered {
    position: relative;
    justify-content: center;
    text-align: center;
    align-items: center;
  }

  .page-title-card.page-title-centered > div {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
  }

  .page-title-card.page-title-centered .primary-mini {
    position: absolute;
    right: 22px;
    top: 22px;
  }

  .form-panel.form-panel-centered .section-head {
    position: relative;
    justify-content: center;
    align-items: center;
    text-align: center;
    min-height: 58px;
  }

  .form-panel.form-panel-centered .section-head > div:last-child {
    width: 100%;
    text-align: center;
  }

  .form-panel.form-panel-centered .section-title-icon {
    position: absolute;
    left: 0;
    top: 0;
  }

  @media (max-width: 720px) {
    .page-title-card.page-title-centered {
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
    }

    .page-title-card.page-title-centered .primary-mini {
      position: static;
      width: 100%;
      margin-top: 14px;
      text-align: center;
    }

    .form-panel.form-panel-centered .section-head {
      min-height: 0;
      padding-top: 0;
    }

    .form-panel.form-panel-centered .section-title-icon {
      position: static;
      margin: 0 auto 10px;
    }
  }

`;
