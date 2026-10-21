"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Download, Pencil, Plus, Search, Target, Trash2, UsersRound, X } from "lucide-react";
import { usePeriodRecords } from "@/lib/use-period-records";
import { useCrmStore } from "@/lib/store";
import { downloadXlsx } from "@/lib/xlsx";
import type { Customer, Goal, Order } from "@/lib/types";

type GoalForm = Omit<Goal, "id">;
type GoalMetric = {
  label: string;
  icon: "weight" | "revenue" | "customers" | "conversion";
  actual: number;
  target: number;
  unit: "kg" | "currency" | "clients" | "percent";
};

const currentDate = new Date();
const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const decimal = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const monthName = (month: number) => new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, month - 1, 1));

function periodBounds(goal: Goal) {
  if (goal.type === "Anual") return { start: `${goal.year}-01-01`, end: `${goal.year}-12-31` };
  const month = goal.month ?? 1;
  return {
    start: `${goal.year}-${String(month).padStart(2, "0")}-01`,
    end: `${goal.year}-${String(month).padStart(2, "0")}-${String(new Date(goal.year, month, 0).getDate()).padStart(2, "0")}`,
  };
}

function goalPeriodLabel(goal: Goal) {
  return goal.type === "Anual" ? `Meta anual · ${goal.year}` : `Meta mensal · ${monthName(goal.month ?? 1)} de ${goal.year}`;
}

function matchesCustomer(customer: Customer, order: Order) {
  return order.customerId === customer.id ||
    (!order.customerId && order.customerCode.toLowerCase() === customer.code.toLowerCase() && order.store === customer.store);
}

function goalMetrics(goal: Goal, customers: Customer[], orders: Order[]): GoalMetric[] {
  const period = periodBounds(goal);
  const periodOrders = orders.filter((order) =>
    order.status === "normal" && order.issueDate >= period.start && order.issueDate <= period.end,
  );
  const buyerIds = new Set<string>();
  periodOrders.forEach((order) => {
    customers.filter((customer) => matchesCustomer(customer, order) && customer.status === "Ativo")
      .forEach((customer) => buyerIds.add(customer.id));
  });
  const revenue = periodOrders.reduce((sum, order) => sum + order.totalValue, 0);
  const weight = periodOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const activeCustomerCount = customers.filter((customer) => customer.status === "Ativo").length;
  const conversion = activeCustomerCount ? buyerIds.size / activeCustomerCount * 100 : 0;
  return [
    { label: "Peso vendido", icon: "weight", actual: weight, target: goal.targetKg, unit: "kg" },
    { label: "Receita", icon: "revenue", actual: revenue, target: goal.targetRevenue, unit: "currency" },
    { label: "Positivação", icon: "customers", actual: buyerIds.size, target: goal.targetCustomers, unit: "clients" },
    { label: "Conversão", icon: "conversion", actual: conversion, target: goal.targetConversion, unit: "percent" },
  ];
}

function metricValue(value: number, unit: GoalMetric["unit"]) {
  if (unit === "currency") return currency(value);
  if (unit === "clients") return `${decimal(value)} ${value === 1 ? "cliente" : "clientes"}`;
  if (unit === "percent") return `${decimal(value)}%`;
  return `${decimal(value)} kg`;
}

function progress(actual: number, target: number) {
  return target > 0 ? actual / target * 100 : 0;
}

function blankGoal(): GoalForm {
  return {
    title: "",
    type: "Mensal",
    year: currentDate.getFullYear(),
    month: currentDate.getMonth() + 1,
    targetRevenue: 0,
    targetKg: 0,
    targetCustomers: 0,
    targetConversion: 0,
    status: "Ativa",
  };
}

function MetricIcon({ metric }: { metric: GoalMetric }) {
  if (metric.icon === "customers") return <UsersRound size={17} />;
  if (metric.icon === "conversion") return <Target size={17} />;
  if (metric.icon === "revenue") return <span className="goal-currency-icon">R$</span>;
  return <span className="goal-weight-icon">kg</span>;
}

export default function GoalsPage() {
  const { goals, customers, addGoal, updateGoal, deleteGoal, deleteGoals, dataError } = useCrmStore();
  const goalRanges = goals.map(periodBounds);
  const reportStart = goalRanges.map(range => range.start).sort()[0] || "";
  const reportEnd = goalRanges.map(range => range.end).sort().at(-1) || "";
  const orderData = usePeriodRecords<Order>("orders", reportStart, reportEnd, goals.length > 0);
  const orders = orderData.rows;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<GoalForm>(blankGoal);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const visibleGoals = useMemo(() => goals
    .filter((goal) => statusFilter === "Todos" || goal.status === statusFilter)
    .filter((goal) => `${goal.title} ${goalPeriodLabel(goal)} ${goal.year}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
    .sort((a, b) => b.year - a.year || (b.month ?? 0) - (a.month ?? 0) || a.title.localeCompare(b.title, "pt-BR")),
  [goals, search, statusFilter]);

  function openCreate() {
    setEditingGoal(null);
    setForm(blankGoal());
    setError("");
    setModalOpen(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      type: goal.type,
      year: goal.year,
      month: goal.month ?? currentDate.getMonth() + 1,
      targetRevenue: goal.targetRevenue,
      targetKg: goal.targetKg,
      targetCustomers: goal.targetCustomers,
      targetConversion: goal.targetConversion,
      status: goal.status,
    });
    setError("");
    setModalOpen(true);
  }

  async function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Informe um título para a meta.");
      return;
    }
    if (!Number.isInteger(form.year) || form.year < 2000 || form.year > 2100) {
      setError("Informe um ano válido entre 2000 e 2100.");
      return;
    }
    if (form.type === "Mensal" && (!form.month || form.month < 1 || form.month > 12)) {
      setError("Selecione o mês da meta.");
      return;
    }
    if ([form.targetRevenue, form.targetKg, form.targetCustomers, form.targetConversion].some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(form.targetCustomers)) {
      setError("Os valores das metas devem ser números iguais ou maiores que zero.");
      return;
    }
    if (form.targetConversion > 100) {
      setError("A meta de conversão não pode ultrapassar 100%.");
      return;
    }
    const { month, ...annualFields } = form;
    const payload: GoalForm = form.type === "Anual"
      ? { ...annualFields, title: form.title.trim() }
      : { ...form, month, title: form.title.trim() };
    setSaving(true);
    setError("");
    try {
      if (editingGoal) await updateGoal(editingGoal.id, payload);
      else await addGoal(payload);
      setModalOpen(false);
      setEditingGoal(null);
    } catch (cause) {
      console.error("Falha ao salvar a meta.", cause);
      setError("Não foi possível salvar a meta. Verifique a conexão e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDeleteIds.length) return;
    setSaving(true);
    setError("");
    try {
      if (pendingDeleteIds.length === 1) await deleteGoal(pendingDeleteIds[0]);
      else await deleteGoals(pendingDeleteIds);
      setSelectedIds((current) => current.filter((id) => !pendingDeleteIds.includes(id)));
      setPendingDeleteIds([]);
    } catch (cause) {
      console.error("Falha ao excluir a(s) meta(s).", cause);
      setError("Não foi possível excluir a(s) meta(s). Verifique a conexão e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function exportGoals() {
    if (!visibleGoals.length) return;
    setExporting(true);
    setError("");
    try {
      const headings = ["Título", "Tipo", "Período", "Status", "Peso realizado (kg)", "Meta peso (kg)", "Receita realizada (R$)", "Meta receita (R$)", "Clientes positivados", "Meta clientes", "Conversão (%)", "Meta conversão (%)"];
      const rows = visibleGoals.map((goal) => {
        const metrics = goalMetrics(goal, customers, orders);
        return [
          goal.title, goal.type, goalPeriodLabel(goal), goal.status,
          metrics[0].actual, goal.targetKg, metrics[1].actual, goal.targetRevenue,
          metrics[2].actual, goal.targetCustomers, metrics[3].actual, goal.targetConversion,
        ];
      });
      await downloadXlsx("metas-bom-destino.xlsx", "Metas", headings, rows);
    } catch (cause) {
      console.error("Falha ao exportar metas.", cause);
      setError("Não foi possível exportar as metas. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  function toggleGoalSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]);
  }

  function toggleVisibleSelection() {
    const visibleIds = visibleGoals.map((goal) => goal.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  const allVisibleSelected = visibleGoals.length > 0 && visibleGoals.every((goal) => selectedIds.includes(goal.id));

  if (orderData.error) return <div className="page-content"><p role="alert">{orderData.error}</p></div>;
  if (orderData.loading) return <div className="page-content"><p role="status">Carregando resultados das metas...</p></div>;
  return <div className="page-content goals-page">
    <header className="goals-page-heading">
      <div><p className="eyebrow">PLANEJAMENTO COMERCIAL</p><h1>Metas</h1><p>Acompanhe o progresso das metas mensais e anuais cadastradas.</p></div>
      <button type="button" className="button button-primary" onClick={openCreate}><Pencil size={15} /> Nova meta</button>
    </header>
    <div className="goals-toolbar">
      <div className="goals-sync-badge"><span className={dataError ? "goals-sync-indicator goals-sync-error" : "goals-sync-indicator"}>{dataError ? <X size={14} /> : <Check size={14} />}</span><span><strong>{dataError ? "Falha na sincronização" : "Dados sincronizados"}</strong><small>{dataError || "Metas e pedidos consultados para os períodos cadastrados"}</small></span></div>
      <div className="goals-search-filters"><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título ou período" aria-label="Buscar metas por título ou período" /></label><select aria-label="Filtrar status das metas" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="Todos">Todos os status</option><option value="Ativa">Ativas</option><option value="Inativa">Inativas</option></select></div>
    </div>
    <div className="goals-bulk-actions">
      <label className="goals-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} /> Selecionar exibidas</label>
      <button type="button" className="button button-outline" onClick={() => void exportGoals()} disabled={!visibleGoals.length || exporting}><Download size={14} /> {exporting ? "Exportando..." : "Exportar XLSX"}</button>
      <button type="button" className="button button-outline goals-delete-selected" onClick={() => setPendingDeleteIds(selectedIds)} disabled={!selectedIds.length}><Trash2 size={14} /> Excluir selecionadas{selectedIds.length ? ` (${selectedIds.length})` : ""}</button>
    </div>
    <div className="goals-list">{visibleGoals.map((goal) => {
      const metrics = goalMetrics(goal, customers, orders);
      const period = goalPeriodLabel(goal);
      return <article className="panel goal-card" key={goal.id}>
        <header className="goal-card-heading"><label className="goal-card-select" aria-label={`Selecionar meta ${goal.title}`}><input type="checkbox" checked={selectedIds.includes(goal.id)} onChange={() => toggleGoalSelection(goal.id)} /></label><span className="goal-calendar-icon"><CalendarDays size={18} /></span><div className="goal-card-title"><h2>{goal.title}</h2><p>{period} <span>·</span> <span className={`goal-status-badge ${goal.status === "Ativa" ? "goal-status-active" : ""}`}>{goal.status}</span></p></div><div className="goal-card-actions"><button type="button" className="button button-outline" onClick={() => openEdit(goal)}><Pencil size={14} /> Editar</button><button type="button" className="button button-outline goals-delete-button" onClick={() => setPendingDeleteIds([goal.id])}><Trash2 size={14} /> Excluir</button></div></header>
        <div className="goal-metrics-grid">{metrics.map((metric) => {
          const percentComplete = progress(metric.actual, metric.target);
          const remaining = Math.max(metric.target - metric.actual, 0);
          const isReached = metric.target > 0 && metric.actual >= metric.target;
          return <section className={`goal-metric goal-metric-${metric.icon}`} key={metric.label}>
            <div className="goal-metric-heading"><span className="goal-metric-icon"><MetricIcon metric={metric} /></span><strong>{metric.label}</strong><b>{metric.target > 0 ? `${decimal(percentComplete)}%` : "—"}</b></div>
            <div className="goal-metric-values"><div><small>Realizado</small><strong>{metricValue(metric.actual, metric.unit)}</strong></div><div><small>Meta</small><strong>{metricValue(metric.target, metric.unit)}</strong></div></div>
            <div className="goal-progress-track"><span className={isReached ? "goal-progress-complete" : ""} style={{ width: `${Math.min(percentComplete, 100)}%` }} /></div>
            <small className="goal-remaining">{metric.target > 0 ? isReached ? "Meta atingida" : `Faltam ${metricValue(remaining, metric.unit)}` : "Meta não definida"}</small>
          </section>;
        })}</div>
      </article>;
    })}{!visibleGoals.length && <section className="panel goals-empty"><Target size={25} /><h2>{goals.length ? "Nenhuma meta encontrada" : "Ainda não há metas cadastradas"}</h2><p>{goals.length ? "Altere a busca ou o filtro para ver outras metas." : "Crie uma meta mensal ou anual para acompanhar os resultados comerciais."}</p>{!goals.length && <button type="button" className="button button-primary" onClick={openCreate}><Plus size={15} /> Criar primeira meta</button>}</section>}</div>
    {error && <p className="form-error goals-page-error" role="alert">{error}</p>}

    {modalOpen && <div className="modal-backdrop goals-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
      <section className="customer-modal goals-form-modal" role="dialog" aria-modal="true" aria-labelledby="goal-form-title">
        <header className="goals-form-heading"><div><h2 id="goal-form-title">{editingGoal ? "Editar meta" : "Criar meta"}</h2><p>Defina o período e os indicadores comerciais que deseja acompanhar.</p></div><button type="button" className="icon-button" aria-label="Fechar" disabled={saving} onClick={() => setModalOpen(false)}><X size={18} /></button></header>
        <form onSubmit={(event) => void saveGoal(event)}>
          <div className="goals-form-grid">
            <label><span>Título</span><input autoFocus value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Junho de 2026" maxLength={80} required /></label>
            <label><span>Tipo</span><select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as GoalForm["type"], month: event.target.value === "Anual" ? undefined : current.month ?? currentDate.getMonth() + 1 }))}><option>Mensal</option><option>Anual</option></select></label>
            <label><span>Ano</span><input type="number" min="2000" max="2100" step="1" value={form.year} onChange={(event) => setForm((current) => ({ ...current, year: Number(event.target.value) }))} required /></label>
            {form.type === "Mensal" && <label><span>Mês</span><select value={form.month ?? ""} onChange={(event) => setForm((current) => ({ ...current, month: Number(event.target.value) }))} required><option value="" disabled>Selecione</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option value={month} key={month}>{monthName(month)}</option>)}</select></label>}
            <label><span>Meta Receita (R$)</span><input type="number" min="0" step="0.01" value={form.targetRevenue} onChange={(event) => setForm((current) => ({ ...current, targetRevenue: Number(event.target.value) }))} /></label>
            <label><span>Meta KG</span><input type="number" min="0" step="0.01" value={form.targetKg} onChange={(event) => setForm((current) => ({ ...current, targetKg: Number(event.target.value) }))} /></label>
            <label><span>Meta Clientes</span><input type="number" min="0" step="1" value={form.targetCustomers} onChange={(event) => setForm((current) => ({ ...current, targetCustomers: Number(event.target.value) }))} /></label>
            <label><span>Meta Conversão (%)</span><input type="number" min="0" max="100" step="0.01" value={form.targetConversion} onChange={(event) => setForm((current) => ({ ...current, targetConversion: Number(event.target.value) }))} /></label>
            <label><span>Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as GoalForm["status"] }))}><option>Ativa</option><option>Inativa</option></select></label>
          </div>
          <div className="goal-period-preview">{form.type === "Anual" ? `Período anual: ${form.year}` : `Período mensal: ${form.year} · ${form.month ? monthName(form.month) : "Mês"}`}</div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="goals-form-footer"><button type="button" className="button button-outline" disabled={saving} onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></footer>
        </form>
      </section>
    </div>}

    {pendingDeleteIds.length > 0 && <div className="modal-backdrop goals-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPendingDeleteIds([]); }}>
      <section className="customer-modal goals-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="goals-delete-title"><div><span className="goal-delete-icon"><Trash2 size={19} /></span><h2 id="goals-delete-title">Excluir {pendingDeleteIds.length === 1 ? "meta" : "metas"}?</h2><p>Esta ação remove permanentemente {pendingDeleteIds.length === 1 ? "a meta selecionada" : `as ${pendingDeleteIds.length} metas selecionadas`}.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="button button-outline" disabled={saving} onClick={() => setPendingDeleteIds([])}>Cancelar</button><button type="button" className="button button-danger" disabled={saving} onClick={() => void confirmDelete()}>{saving ? "Excluindo..." : "Excluir"}</button></footer></section>
    </div>}
  </div>;
}
