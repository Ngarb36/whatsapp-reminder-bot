"use client"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback, useRef } from "react"
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Asset {
  rowIdx: number
  name: string
  current: number
  invested: number
  profit: number
  returnPct: number
  status: string
  bank: string
  category: "liquid" | "savings" | "debt" | "illiquid" | "pension"
}

interface Stock {
  rowIdx: number
  ticker: string
  name: string
  qty: number
  invested: number
  current: number
  profit: number
  allTimePct: number
  dailyChange: string
}

interface Expense {
  rowIdx: number
  service: string
  chargeAmount: string
  chargeType: string
  monthlyILS: number
}

interface AllData {
  assets: Asset[]
  stocks: Stock[]
  expenses: Expense[]
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function num(s: string | undefined): number {
  if (!s) return 0
  return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0
}

function categorize(status: string, name: string): Asset["category"] {
  // Status is the ground truth – name used only for exceptions
  if (status.includes("חוב")) return "debt"
  if (status.includes("פנסיה")) return "pension"
  // קרן השתלמות = savings even when status is "לא גניש"
  if (name.includes("השתלמות")) return "savings"
  // כספית = money market = always liquid regardless of status
  if (name.includes("כספית")) return "liquid"
  // Now purely status-based
  if (status.includes("נייל")) return "liquid"
  if (status.includes("לא גניש") || status.includes("לא נגיש")) return "illiquid"
  if (status.includes("סוחות") || status.includes("סוטות") || status.includes("ארוך") || status.includes("קצר")) return "savings"
  // Default: liquid – bank accounts/foreign accounts/payment apps with no explicit status
  return "liquid"
}

function parseAssets(rows: string[][]): Asset[] {
  // Nadav tab: assets in rows 6-22 (array indices 5-21)
  // A=type, B=update_time, C=name, D=current, E=invested, F=profit, G=return_pct, H=status
  const skip = (s: string) => !s || s.includes("#REF") || s.includes('סה"כ') || s.includes("סה״כ") || s === "אחר" || s === "Name"
  const result: Asset[] = []
  for (let i = 5; i <= 21 && i < rows.length; i++) {
    const r = rows[i] || []
    const name = r[2] || ""
    if (skip(name)) continue
    const status = r[7] || ""
    result.push({
      rowIdx: i + 1, // 1-indexed sheet row
      name,
      current: num(r[3]),
      invested: num(r[4]),
      profit: num(r[5]),
      returnPct: num(r[6]),
      status,
      bank: "",
      category: categorize(status, name),
    })
  }
  return result
}

function parseStocks(rows: string[][]): Stock[] {
  // Nadav tab: portfolio starts at row 40 (array index 39)
  // A=ticker, B=name, C=qty, D=invested, E=current, F=profit, G=all_time_pct, H=daily_change
  const result: Stock[] = []
  for (let i = 39; i < rows.length; i++) {
    const r = rows[i] || []
    const name = r[1] || ""
    if (!name || name === "שם" || name.includes('סה"כ') || name.includes("סה״כ")) continue
    const invested = num(r[3])
    const current = num(r[4])
    if (invested === 0 && current === 0) continue
    result.push({
      rowIdx: i + 1, // 1-indexed sheet row
      ticker: (r[0] && r[0] !== "-") ? r[0] : name,
      name,
      qty: num(r[2]),
      invested,
      current,
      profit: num(r[5]),
      allTimePct: num(r[6]),
      dailyChange: r[7] || "",
    })
  }
  return result
}

function parseExpenses(rows: string[][]): Expense[] {
  // Skip header, totals, and empty rows – handle different quote styles
  const isSkip = (s: string) => !s || s === "שירות" || s.includes('סה"כ') || s.includes("סה״כ") || s === "Name"
  const result: Expense[] = []
  // Find the column where "שירות" header appears (row index 4 = sheet row 5)
  let svcCol = 11
  const headerRow = rows[4] || []
  for (let c = 10; c <= 15; c++) {
    if (headerRow[c] === "שירות") { svcCol = c; break }
  }
  for (let i = 5; i <= 20 && i < rows.length; i++) {
    const r = rows[i]
    const service = r?.[svcCol]
    if (isSkip(service)) continue
    // monthly column: try svcCol+5 then svcCol+4
    const monthly = num(r[svcCol + 5]) || num(r[svcCol + 4]) || 0
    result.push({
      rowIdx: i,
      service,
      chargeAmount: r[svcCol + 1] || "",
      chargeType: r[svcCol + 2] || "",
      monthlyILS: monthly,
    })
  }
  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Format number with correct currency symbol and decimals
const fmt = (n: number, currency: "ILS" | "USD" | "EUR" = "ILS") => {
  const abs = Math.abs(n)
  const decimals = abs % 1 === 0 ? 0 : 2
  const formatted = abs.toLocaleString("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₪"
  return symbol + formatted
}

// Detect currency from raw string and format
const fmtRaw = (raw: string): string => {
  if (!raw) return "—"
  if (raw.includes("$")) return "$" + raw.replace(/[$,\s]/g, "")
  if (raw.includes("€")) return "€" + raw.replace(/[€,\s]/g, "")
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ""))
  if (isNaN(n)) return raw
  const decimals = n % 1 === 0 ? 0 : 2
  return "₪" + n.toLocaleString("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const fmtPct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%"
const fmtNum = (n: number) => n % 1 === 0 ? n.toLocaleString("he-IL") : n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function EditableCell({
  value, range, onSave, className = "",
}: { value: string; range: string; onSave: (r: string, v: string) => Promise<void>; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setVal(value), [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = useCallback(async () => {
    setEditing(false)
    if (val === value) return
    setSaving(true)
    try { await onSave(range, val) } catch { setVal(value) } finally { setSaving(false) }
  }, [val, value, range, onSave])

  if (editing)
    return <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(value); setEditing(false) } }}
      className={`w-full bg-slate-700 border border-blue-500 rounded px-2 py-0.5 text-sm outline-none ${className}`} dir="rtl" />

  return <span onClick={() => setEditing(true)} title="לחץ לעריכה"
    className={`cursor-pointer hover:bg-slate-600/40 rounded px-1 py-0.5 transition-colors inline-block w-full ${saving ? "opacity-50" : ""} ${className}`}>
    {saving ? "..." : val || "—"}
  </span>
}

// ─── Chart colors ─────────────────────────────────────────────────────────────

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"]

const categoryLabel: Record<string, string> = {
  liquid: "נזיל 💧",
  savings: "חסכונות 📈",
  illiquid: "לא נגיש 🔒",
  pension: "פנסיה 👴",
  debt: "חוב 💳",
}
const categoryColor: Record<string, string> = {
  liquid: "#10b981",
  savings: "#3b82f6",
  illiquid: "#f59e0b",
  pension: "#8b5cf6",
  debt: "#ef4444",
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

type Tab = "overview" | "assets" | "portfolio" | "debt" | "expenses"

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<AllData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [includePension, setIncludePension] = useState(true)

  useEffect(() => { if (status === "unauthenticated") router.push("/") }, [status, router])

  const fetchData = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const nadavRes = await fetch("/api/sheets?sheet=Nadav&range=A1:V90")
      const n = await nadavRes.json()
      const nadavRows = n.values || []
      setData({
        assets: parseAssets(nadavRows),
        stocks: parseStocks(nadavRows),
        expenses: parseExpenses(nadavRows),
      })
      setLastUpdated(new Date())
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (status === "authenticated") fetchData() }, [status, fetchData])

  const handleSave = useCallback(async (range: string, value: string) => {
    const res = await fetch("/api/sheets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ range, value }) })
    if (!res.ok) throw new Error("שגיאה בשמירה")
    fetchData()
  }, [fetchData])

  if (status === "loading" || loading)
    return <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-slate-400">טוען נתונים...</span>
    </div>

  if (error)
    return <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-red-400">{error}</p>
      <button onClick={fetchData} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg">נסה שוב</button>
    </div>

  if (!data) return null

  const pensionItems = data.assets.filter(a => a.category === "pension")
  const nonDebt = data.assets.filter(a => a.category !== "debt" && (includePension || a.category !== "pension"))
  const debtItems = data.assets.filter(a => a.category === "debt")
  const liquidItems = data.assets.filter(a => a.category === "liquid")
  const savingsItems = data.assets.filter(a => a.category === "savings")
  const illiquidItems = data.assets.filter(a => a.category === "illiquid" || (includePension && a.category === "pension"))

  const totalAssets = nonDebt.reduce((s, a) => s + a.current, 0)
  const totalDebt = debtItems.reduce((s, a) => s + a.current, 0)
  const totalLiquid = liquidItems.reduce((s, a) => s + a.current, 0)
  const totalStocks = data.stocks.reduce((s, st) => s + st.current, 0)
  const totalStocksProfit = data.stocks.reduce((s, st) => s + st.profit, 0)
  const totalMonthlyExpenses = data.expenses.reduce((s, e) => s + e.monthlyILS, 0)

  // Pie chart data – asset allocation by category
  const pieData = Object.entries(
    nonDebt.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + a.current
      return acc
    }, {} as Record<string, number>)
  ).map(([cat, val]) => ({ name: categoryLabel[cat] || cat, value: val }))

  // Stocks bar chart
  const stocksBarData = [...data.stocks]
    .sort((a, b) => b.profit - a.profit)
    .map(s => ({ name: s.ticker, profit: Math.round(s.profit), pct: s.allTimePct }))

  // Expenses pie
  const expPieData = data.expenses
    .filter(e => e.monthlyILS > 0)
    .map(e => ({ name: e.service, value: e.monthlyILS }))

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "ראשי", icon: "🏠" },
    { id: "assets", label: "נכסים", icon: "🏦" },
    { id: "portfolio", label: "תיק מניות", icon: "📈" },
    { id: "debt", label: "חוב", icon: "💳" },
    { id: "expenses", label: "הוצאות קבועות", icon: "🧾" },
  ]

  return (
    <div className="min-h-screen bg-slate-900 pb-12">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700 px-6 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <h1 className="text-lg font-bold text-white">Nadav&apos;s Finance Tracker</h1>
              {lastUpdated && <p className="text-xs text-slate-500">עודכן: {lastUpdated.toLocaleTimeString("he-IL")}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors text-sm">🔄 רענן</button>
            <button
              onClick={() => setIncludePension(p => !p)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border ${includePension ? "bg-purple-900/40 border-purple-700 text-purple-300 hover:bg-purple-900/60" : "bg-slate-700/40 border-slate-600 text-slate-400 hover:bg-slate-700"}`}
            >
              👴 פנסיה {includePension ? "כלולה" : "לא כלולה"}
            </button>
            <button onClick={() => signOut({ callbackUrl: "/" })} className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors text-sm">יציאה</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-slate-800/50 border-b border-slate-700 sticky top-[57px] z-10">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-white"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ══════════════════════ OVERVIEW ══════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card title="סה״כ נכסים" value={fmt(totalAssets)} icon="📊" color="blue" sub="לפני חובות" />
              <Card title="נכסים נזילים" value={fmt(totalLiquid)} icon="💧" color="green" sub="זמינים עכשיו" />
              <Card title="תיק מניות" value={fmt(totalStocks)} icon="📈" color="purple"
                sub={`${totalStocksProfit >= 0 ? "+" : ""}${fmt(totalStocksProfit)} רווח`} positive={totalStocksProfit >= 0} />
              <Card title="חוב כולל" value={fmt(totalDebt)} icon="💳" color="red" sub="אשראי + כרטיסים" />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Asset allocation pie */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                <h3 className="text-white font-semibold mb-4">📊 חלוקת נכסים</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100}
                      paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={Object.values(categoryColor)[i] || COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly expenses – table + donut */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="text-white font-semibold">🧾 הוצאות חודשיות קבועות</h3>
                  <span className="text-red-400 font-bold font-mono">{fmt(totalMonthlyExpenses)}/חודש</span>
                </div>
                <div className="flex">
                  {/* Mini donut */}
                  <div className="w-36 flex-shrink-0 flex items-center justify-center py-3">
                    <ResponsiveContainer width={120} height={120}>
                      <PieChart>
                        <Pie data={expPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                          {expPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Expense rows */}
                  <div className="flex-1 overflow-y-auto max-h-52">
                    <table className="w-full text-xs">
                      <tbody>
                        {data.expenses.filter(e => e.monthlyILS > 0).sort((a, b) => b.monthlyILS - a.monthlyILS).map((e, i) => (
                          <tr key={e.rowIdx} className="border-b border-slate-700/40 hover:bg-slate-700/30">
                            <td className="px-3 py-1.5 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="text-slate-300">{e.service}</span>
                            </td>
                            <td className="px-3 py-1.5 text-left font-mono text-red-400">{fmt(e.monthlyILS)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Stocks profit bar */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
              <h3 className="text-white font-semibold mb-4">📈 ביצועי מניות – רווח/הפסד</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stocksBarData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={v => `₪${v}`} />
                  <Tooltip formatter={(v: number) => [`₪${v}`, "רווח/הפסד"]} />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {stocksBarData.map((entry, i) => (
                      <Cell key={i} fill={entry.profit >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Quick summary table – grouped */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700">
                <h3 className="text-white font-semibold">📋 סיכום נכסים</h3>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                  <th className="text-right px-4 py-3">שם</th>
                  <th className="text-right px-4 py-3">שווי</th>
                  <th className="text-right px-4 py-3">תשואה</th>
                  <th className="text-right px-4 py-3">בנק</th>
                </tr></thead>
                <tbody>
                  {/* ── חשבון בנק ── */}
                  <tr className="bg-emerald-900/20 border-b border-slate-700">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                      💧 חשבון בנק — {fmt(liquidItems.reduce((s, a) => s + a.current, 0))}
                    </td>
                  </tr>
                  {liquidItems.map(a => (
                    <tr key={a.rowIdx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-4 py-2.5 font-medium text-white pr-8">{a.name}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-200">{fmt(a.current)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">—</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{a.bank}</td>
                    </tr>
                  ))}

                  {/* ── אשראי ── */}
                  <tr className="bg-red-900/20 border-b border-slate-700 border-t-2 border-t-slate-600">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-red-400 uppercase tracking-wide">
                      💳 אשראי — {fmt(totalDebt)}
                    </td>
                  </tr>
                  {debtItems.map(a => (
                    <tr key={a.rowIdx} className="border-b border-slate-700/50 hover:bg-red-900/10 bg-red-900/5">
                      <td className="px-4 py-2.5 font-medium text-white pr-8">{a.name}</td>
                      <td className="px-4 py-2.5 font-mono text-red-400">{fmt(a.current)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">—</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{a.bank}</td>
                    </tr>
                  ))}

                  {/* ── חסכונות, השקעות ופנסיה ── */}
                  <tr className="bg-blue-900/20 border-b border-slate-700 border-t-2 border-t-slate-600">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-blue-400 uppercase tracking-wide">
                      🔒 חסכונות, השקעות ופנסיה — {fmt([...savingsItems, ...illiquidItems].reduce((s, a) => s + a.current, 0))}
                    </td>
                  </tr>
                  {[...savingsItems, ...illiquidItems].map(a => (
                    <tr key={a.rowIdx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-4 py-2.5 font-medium text-white pr-8">{a.name}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-200">{fmt(a.current)}</td>
                      <td className={`px-4 py-2.5 font-mono text-xs ${a.returnPct > 0 ? "text-emerald-400" : a.returnPct < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {a.returnPct ? fmtPct(a.returnPct) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{a.bank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══════════════════════ ASSETS ══════════════════════ */}
        {activeTab === "assets" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Card title="נזיל זמין" value={fmt(liquidItems.reduce((s, a) => s + a.current, 0))} icon="💧" color="green" />
              <Card title="חסכונות" value={fmt(savingsItems.reduce((s, a) => s + a.current, 0))} icon="🏦" color="blue" />
              <Card title="לא נגיש" value={fmt(illiquidItems.reduce((s, a) => s + a.current, 0))} icon="🔒" color="amber" />
            </div>

            {[
              { label: "💧 נכסים נזילים", items: liquidItems, color: "emerald" },
              { label: "📈 חסכונות והשקעות", items: savingsItems, color: "blue" },
              { label: "🔒 לא נגיש / פנסיה", items: illiquidItems, color: "amber" },
            ].map(({ label, items, color }) => items.length > 0 && (
              <div key={label} className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                  <h3 className="text-white font-semibold">{label}</h3>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                    <th className="text-right px-4 py-3">שם</th>
                    <th className="text-right px-4 py-3">שווי נוכחי</th>
                    <th className="text-right px-4 py-3">מושקע</th>
                    <th className="text-right px-4 py-3">רווח</th>
                    <th className="text-right px-4 py-3">תשואה</th>
                    <th className="text-right px-4 py-3">סטטוס</th>
                  </tr></thead>
                  <tbody>
                    {items.map(a => (
                      <tr key={a.rowIdx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-3 font-medium text-white">
                          <EditableCell value={a.name} range={`Nadav!C${a.rowIdx}`} onSave={handleSave} />
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <EditableCell value={Math.round(a.current).toLocaleString("he-IL")} range={`Nadav!D${a.rowIdx}`} onSave={handleSave} className="text-white" />
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">{a.invested ? fmt(a.invested) : "—"}</td>
                        <td className={`px-4 py-3 font-mono text-xs ${a.profit > 0 ? "text-emerald-400" : a.profit < 0 ? "text-red-400" : "text-slate-500"}`}>
                          {a.profit ? fmt(a.profit) : "—"}
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs ${a.returnPct > 0 ? "text-emerald-400" : a.returnPct < 0 ? "text-red-400" : "text-slate-500"}`}>
                          {a.returnPct ? fmtPct(a.returnPct) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          <EditableCell value={a.status} range={`Nadav!H${a.rowIdx}`} onSave={handleSave} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        {/* ══════════════════════ PORTFOLIO ══════════════════════ */}
        {activeTab === "portfolio" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card title="שווי תיק" value={fmt(totalStocks)} icon="📊" color="blue" />
              <Card title="מושקע" value={fmt(data.stocks.reduce((s, st) => s + st.invested, 0))} icon="💼" color="purple" />
              <Card title="רווח/הפסד" value={fmt(totalStocksProfit)} icon={totalStocksProfit >= 0 ? "📈" : "📉"} color={totalStocksProfit >= 0 ? "green" : "red"} positive={totalStocksProfit >= 0} />
              <Card title="מס׳ פוזיציות" value={String(data.stocks.length)} icon="🎯" color="amber" />
            </div>

            {/* Stocks chart */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
              <h3 className="text-white font-semibold mb-4">📊 רווח/הפסד לפי מניה</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stocksBarData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={v => `₪${v}`} />
                  <Tooltip formatter={(v: number, name) => [name === "profit" ? `₪${v}` : `${v}%`, name === "profit" ? "רווח/הפסד" : "תשואה"]} />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]} name="profit">
                    {stocksBarData.map((e, i) => <Cell key={i} fill={e.profit >= 0 ? "#10b981" : "#ef4444"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Stocks table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700">
                <h3 className="text-white font-semibold">📋 פירוט מניות</h3>
                <p className="text-xs text-slate-500 mt-0.5">לחץ לעריכה</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                    <th className="text-right px-4 py-3">טיקר</th>
                    <th className="text-right px-4 py-3">שם</th>
                    <th className="text-right px-4 py-3">כמות</th>
                    <th className="text-right px-4 py-3">מושקע</th>
                    <th className="text-right px-4 py-3">שווי נוכחי</th>
                    <th className="text-right px-4 py-3">רווח/הפסד (%)</th>
                    <th className="text-right px-4 py-3">שינוי יומי</th>
                  </tr></thead>
                  <tbody>
                    {data.stocks.map(s => (
                      <tr key={s.rowIdx} className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${s.profit < 0 ? "bg-red-900/5" : ""}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded text-xs">{s.ticker}</span>
                        </td>
                        <td className="px-4 py-3 text-white font-medium">
                          <EditableCell value={s.name} range={`Nadav!B${s.rowIdx}`} onSave={handleSave} />
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          <EditableCell value={String(s.qty)} range={`Nadav!C${s.rowIdx}`} onSave={handleSave} />
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">{fmt(s.invested)}</td>
                        <td className="px-4 py-3 font-mono text-white">
                          <EditableCell value={Math.round(s.current).toLocaleString("he-IL")} range={`Nadav!E${s.rowIdx}`} onSave={handleSave} />
                        </td>
                        <td className={`px-4 py-3 font-mono ${s.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          <div className="font-semibold">{s.profit >= 0 ? "+" : ""}{fmt(s.profit)}</div>
                          <div className="text-xs opacity-75">{fmtPct(s.allTimePct)}</div>
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs ${s.dailyChange?.startsWith("+") ? "text-emerald-400" : s.dailyChange?.startsWith("-") ? "text-red-400" : "text-slate-400"}`}>
                          {s.dailyChange || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-600 bg-slate-700/40 font-semibold">
                      <td colSpan={3} className="px-4 py-3 text-slate-300">סה״כ</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{fmt(data.stocks.reduce((s, st) => s + st.invested, 0))}</td>
                      <td className="px-4 py-3 font-mono text-white">{fmt(totalStocks)}</td>
                      <td className={`px-4 py-3 font-mono ${totalStocksProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {totalStocksProfit >= 0 ? "+" : ""}{fmt(totalStocksProfit)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════ DEBT ══════════════════════ */}
        {activeTab === "debt" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="סה״כ חוב" value={fmt(totalDebt)} icon="💳" color="red" sub="כרטיסי אשראי וחריגות" />
              <Card title="מס׳ חשבונות חוב" value={String(debtItems.length)} icon="📋" color="amber" />
            </div>

            <div className="bg-slate-800 rounded-2xl border border-red-900/30 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700 bg-red-900/10">
                <h3 className="text-white font-semibold">💳 חובות ואשראי</h3>
                <p className="text-xs text-red-400 mt-0.5">כל הסכומים הן יתרות חוב</p>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                  <th className="text-right px-4 py-3">שם</th>
                  <th className="text-right px-4 py-3">בנק</th>
                  <th className="text-right px-4 py-3">יתרת חוב</th>
                  <th className="text-right px-4 py-3">סטטוס</th>
                </tr></thead>
                <tbody>
                  {debtItems.map(a => (
                    <tr key={a.rowIdx} className="border-b border-slate-700/50 hover:bg-red-900/10">
                      <td className="px-4 py-3 font-medium text-white">
                        <EditableCell value={a.name} range={`Nadav!C${a.rowIdx}`} onSave={handleSave} />
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{a.bank}</td>
                      <td className="px-4 py-3 font-mono text-red-400 font-semibold">{fmt(a.current)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">חוב</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-red-800 bg-red-900/20">
                    <td colSpan={2} className="px-4 py-3 font-semibold text-slate-300">סה״כ חוב</td>
                    <td className="px-4 py-3 font-mono font-bold text-red-400">{fmt(totalDebt)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* ══════════════════════ EXPENSES ══════════════════════ */}
        {activeTab === "expenses" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Card title="הוצאה חודשית" value={fmt(totalMonthlyExpenses)} icon="🧾" color="red" sub="כל המנויים" />
              <Card title="הוצאה שנתית" value={fmt(totalMonthlyExpenses * 12)} icon="📅" color="amber" />
              <Card title="מס׳ מנויים" value={String(data.expenses.length)} icon="📋" color="blue" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                <h3 className="text-white font-semibold mb-4">🧾 פילוח הוצאות חודשיות</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={expPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                      paddingAngle={2} dataKey="value">
                      {expPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                  <h3 className="text-white font-semibold">פירוט מנויים</h3>
                  <p className="text-xs text-slate-500 mt-0.5">לחץ לעריכה</p>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                    <th className="text-right px-4 py-3">שירות</th>
                    <th className="text-right px-4 py-3">סכום</th>
                    <th className="text-right px-4 py-3">סוג</th>
                    <th className="text-right px-4 py-3">חודשי ₪</th>
                  </tr></thead>
                  <tbody>
                    {data.expenses.map(e => (
                      <tr key={e.rowIdx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-2.5 font-medium text-white">
                          <EditableCell value={e.service} range={`Nadav!L${e.rowIdx + 1}`} onSave={handleSave} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">
                          <span className={e.chargeAmount?.includes("$") ? "text-green-400" : e.chargeAmount?.includes("€") ? "text-blue-400" : ""}>
                            <EditableCell value={e.chargeAmount} range={`Nadav!M${e.rowIdx + 1}`} onSave={handleSave} />
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${e.chargeType === "שנתי" ? "bg-amber-900/50 text-amber-300" : "bg-blue-900/50 text-blue-300"}`}>
                            {e.chargeType || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-red-400">
                          {e.monthlyILS ? fmt(e.monthlyILS) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-600 bg-slate-700/40 font-semibold">
                      <td colSpan={3} className="px-4 py-3 text-slate-300">סה״כ לחודש</td>
                      <td className="px-4 py-3 font-mono text-red-400 font-bold">{fmt(totalMonthlyExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  )
}

// ─── Card Component ────────────────────────────────────────────────────────────

function Card({ title, value, icon, color, sub, positive }: {
  title: string; value: string; icon: string; color: "blue" | "green" | "red" | "purple" | "amber"; sub?: string; positive?: boolean
}) {
  const bg = { blue: "from-blue-900/40 border-blue-800/40", green: "from-emerald-900/40 border-emerald-800/40", red: "from-red-900/40 border-red-800/40", purple: "from-purple-900/40 border-purple-800/40", amber: "from-amber-900/40 border-amber-800/40" }
  const text = { blue: "text-blue-300", green: "text-emerald-300", red: "text-red-300", purple: "text-purple-300", amber: "text-amber-300" }
  return (
    <div className={`bg-gradient-to-br ${bg[color]} to-slate-800/40 border rounded-2xl p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-slate-400 text-xs font-medium">{title}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${text[color]}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-slate-500"}`}>{sub}</p>}
    </div>
  )
}
