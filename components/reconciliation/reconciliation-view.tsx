"use client"

import { loadOlderStatementsAction, loadStatementDetailAction } from "@/app/(app)/sap/queue-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  buildTree,
  completionPercent,
  groupLevel,
  groupStatements,
  monthLabel,
  monthName,
  pickDefault,
  rollup,
  splitForQueue,
  type Group,
  type Level,
  type StatementSummary,
  type Thresholds,
} from "@/lib/reconciliation"
import { cn } from "@/lib/utils"
import type { GroupDetail } from "@/models/reconciliation"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { StatementDetail } from "./statement-detail"
import { CompletionBar, LEVEL_BG, LevelDot } from "./status"
import { ThresholdsDialog } from "./thresholds-dialog"

type Mode = "period" | "person"
type Filter = "all" | Level

const LEVELS: Level[] = ["red", "orange", "green"]

function worstLevel(groups: Group[], thresholds: Thresholds): Level {
  const levels = groups.map((group) => groupLevel(group, thresholds))
  return levels.includes("red") ? "red" : levels.includes("orange") ? "orange" : "green"
}

function byMonthDesc(left: Group, right: Group) {
  return (right.month ?? "").localeCompare(left.month ?? "")
}

function QueueRow({
  selected,
  onClick,
  muted,
  indent,
  children,
}: {
  selected?: boolean
  onClick: () => void
  muted?: boolean
  indent?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        "flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
        selected ? "border-primary bg-muted" : "border-transparent",
        indent && "pl-7",
        muted && !selected && "opacity-60"
      )}
    >
      {children}
    </button>
  )
}

function ColumnHeader({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex min-h-11 items-center gap-2 border-b bg-background px-3 py-2">{children}</div>
  )
}

function FoldRow({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60"
    >
      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      {label}
    </button>
  )
}

function LoadingEarlier({ failed, onRetry, label }: { failed: boolean; onRetry: () => void; label: string }) {
  if (failed) {
    return (
      <div className="flex items-center gap-2 border-t px-3 py-3 text-xs text-muted-foreground">
        <span className="flex-1">Earlier months could not be loaded.</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2 border-t px-3 py-3" aria-busy="true">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  )
}

function Mix({ groups, thresholds }: { groups: Group[]; thresholds: Thresholds }) {
  const counts = rollup(groups, thresholds)
  return (
    <div className="mt-1.5 flex h-1 gap-0.5">
      {LEVELS.map((level) =>
        counts[level] > 0 ? <span key={level} className={cn("rounded-full", LEVEL_BG[level])} style={{ flex: counts[level] }} /> : null
      )}
    </div>
  )
}

export function ReconciliationView({
  initialStatements,
  olderBefore,
  initialThresholds,
}: {
  initialStatements: StatementSummary[]
  /** First month of the recent window. Everything before it is loaded after the first screen. */
  olderBefore: string | null
  initialThresholds: Thresholds
}) {
  const [thresholds, setThresholds] = useState(initialThresholds)
  const [older, setOlder] = useState<StatementSummary[] | null>(null)
  const [olderFailed, setOlderFailed] = useState(false)
  const [fresh, setFresh] = useState<Record<string, { purchases: number; missing: number }>>({})
  const [details, setDetails] = useState<Record<string, GroupDetail | "error">>({})
  const inFlight = useRef(new Set<string>())
  const olderRequested = useRef(false)

  // The first statement to open is chosen once, from the latest months, so it does not move as more data arrives.
  const [initial] = useState(() => pickDefault(groupStatements(initialStatements), initialThresholds))
  const [mode, setMode] = useState<Mode>("period")
  const [month, setMonth] = useState<string | null>(initial?.month ?? null)
  const [personId, setPersonId] = useState<string | null>(initial?.employeeId ?? null)
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<Filter>("all")
  const [showComplete, setShowComplete] = useState(false)
  const [query, setQuery] = useState("")

  const groups = useMemo(
    () =>
      groupStatements([...initialStatements, ...(older ?? [])]).map((group) =>
        fresh[group.key] ? { ...group, ...fresh[group.key] } : group
      ),
    [initialStatements, older, fresh]
  )
  const tree = useMemo(() => buildTree(groups), [groups])
  const byKey = useMemo(() => new Map(groups.map((group) => [group.key, group])), [groups])

  const selected = groups.find((group) => group.employeeId === personId && group.month === month) ?? null
  const selKey = selected?.key ?? null
  const selIds = selected ? selected.statementIds.join(",") : ""

  // The selected statement is matched against receipts now. Only this one, never the whole list.
  useEffect(() => {
    if (!selKey || !selIds) return
    if (details[selKey] !== undefined || inFlight.current.has(selKey)) return
    inFlight.current.add(selKey)
    const fail = () => {
      inFlight.current.delete(selKey)
      setDetails((current) => ({ ...current, [selKey]: "error" }))
    }
    loadStatementDetailAction(selIds.split(",")).then((result) => {
      inFlight.current.delete(selKey)
      if (!result.success) return fail()
      setDetails((current) => ({ ...current, [selKey]: result.detail }))
      setFresh((current) => ({
        ...current,
        [selKey]: { purchases: result.detail.purchases, missing: result.detail.missing },
      }))
    }, fail)
  }, [selKey, selIds, details])

  // Older months wait until the first statement is on screen, then load in the background.
  const firstScreenReady = !selKey || details[selKey] !== undefined
  useEffect(() => {
    if (!olderBefore || !firstScreenReady || olderFailed || olderRequested.current) return
    olderRequested.current = true
    const fail = () => {
      olderRequested.current = false
      setOlderFailed(true)
    }
    loadOlderStatementsAction(olderBefore).then((result) => {
      if (result.success) setOlder(result.statements)
      else fail()
    }, fail)
  }, [olderBefore, firstScreenReady, olderFailed])
  const loadingOlder = Boolean(olderBefore) && older === null && !olderFailed

  const monthGroups = groups.filter((group) => group.month === month)
  const personGroups = groups.filter((group) => group.employeeId === personId)
  const contextGroups = mode === "period" ? monthGroups : personGroups
  const queue = useMemo(() => {
    if (mode === "period") return splitForQueue(monthGroups, thresholds)
    const split = splitForQueue(personGroups, thresholds)
    return { incomplete: split.incomplete.slice().sort(byMonthDesc), complete: split.complete.slice().sort(byMonthDesc) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, groups, month, personId, thresholds])
  const summary = rollup(contextGroups, thresholds)

  let shownIncomplete = queue.incomplete
  let shownComplete = queue.complete
  let completeOpen = showComplete
  if (mode === "period" && filter !== "all") {
    shownIncomplete = queue.incomplete.filter((group) => groupLevel(group, thresholds) === filter)
    shownComplete = filter === "green" ? queue.complete : []
    completeOpen = true
  }

  function chooseStatement(group: Group) {
    if (mode === "period") setPersonId(group.employeeId)
    else setMonth(group.month)
  }

  function chooseMonth(next: string | null) {
    setMonth(next)
    const inMonth = groups.filter((group) => group.month === next)
    const { incomplete } = splitForQueue(inMonth, thresholds)
    const target = incomplete[0] ?? inMonth.find((group) => group.employeeId === personId) ?? inMonth[0]
    if (target) setPersonId(target.employeeId)
  }

  function choosePerson(id: string) {
    setPersonId(id)
    const own = groups.filter((group) => group.employeeId === id)
    const incomplete = own.filter((group) => groupLevel(group, thresholds) !== "green").sort(byMonthDesc)
    const target = incomplete[0] ?? own.slice().sort(byMonthDesc)[0]
    if (target) setMonth(target.month)
  }

  function nextIncomplete() {
    const list = queue.incomplete
    if (list.length === 0) return
    const index = list.findIndex((group) => group.key === selKey)
    chooseStatement(list[(index + 1) % list.length])
  }

  function retryDetail() {
    if (!selKey) return
    setDetails((current) => {
      const next = { ...current }
      delete next[selKey]
      return next
    })
  }

  const people = useMemo(() => {
    const byPerson = new Map<string, Group[]>()
    for (const group of groups) byPerson.set(group.employeeId, [...(byPerson.get(group.employeeId) ?? []), group])
    return Array.from(byPerson, ([id, own]) => ({
      id,
      name: own[0].employeeName,
      groups: own,
      worst: worstLevel(own, thresholds),
      incomplete: own.filter((group) => groupLevel(group, thresholds) !== "green").length,
      missing: own.reduce((sum, group) => sum + group.missing, 0),
    }))
  }, [groups, thresholds])
  const personName = people.find((person) => person.id === personId)?.name ?? "Cardholder"
  const needle = query.trim().toLowerCase()
  const matching = people.filter((person) => person.name.toLowerCase().includes(needle))
  const peopleIncomplete = matching
    .filter((person) => person.incomplete > 0)
    .sort((left, right) => right.incomplete - left.incomplete || right.missing - left.missing || left.name.localeCompare(right.name))
  const peopleComplete = matching.filter((person) => person.incomplete === 0).sort((left, right) => left.name.localeCompare(right.name))
  const stripMonths = useMemo(
    () =>
      Array.from(new Set(groups.map((group) => group.month).filter((value): value is string => value !== null)))
        .sort()
        .reverse()
        .slice(0, 12)
        .reverse(),
    [groups]
  )
  const [showCompletePeople, setShowCompletePeople] = useState(false)

  if (groups.length === 0 && !loadingOlder) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        No card statements yet. Upload one above and each cardholder&apos;s receipts will be checked against it.
      </div>
    )
  }

  const crumb =
    mode === "period"
      ? [month ? month.slice(0, 4) : "Undated", month ? monthName(month) : null, selected?.employeeName ?? null]
      : [personName, monthLabel(month)]

  const legend = [
    { level: "red" as const, text: `under ${thresholds.redBelow}%` },
    { level: "orange" as const, text: `${thresholds.redBelow} to ${thresholds.greenAbove}%` },
    { level: "green" as const, text: thresholds.greenAbove >= 100 ? "all attached" : `over ${thresholds.greenAbove}%` },
  ]

  function renderStatementRow(group: Group, muted: boolean) {
    const level = groupLevel(group, thresholds)
    const percent = completionPercent(group.purchases, group.missing)
    const card = group.cards[0]?.replace(/\D/g, "").slice(-4)
    return (
      <QueueRow
        key={group.key}
        selected={group.key === selKey}
        onClick={() => chooseStatement(group)}
        muted={muted}
      >
        <LevelDot level={level} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate">{mode === "period" ? group.employeeName : monthLabel(group.month)}</span>
            {mode === "period" && card ? <span className="text-xs text-muted-foreground">{`\u2022\u2022${card}`}</span> : null}
          </div>
          <div className="mt-1.5">
            <CompletionBar percent={percent} level={level} />
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">
            {group.missing}/{group.purchases}
          </div>
          <div className="text-xs text-muted-foreground">{percent}% attached</div>
        </div>
      </QueueRow>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <nav aria-label="Selection" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          {crumb.filter((part): part is string => Boolean(part)).map((part, index, parts) => (
            <span key={`${part}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight className="size-3.5 text-muted-foreground" /> : null}
              <span className={index === parts.length - 1 ? "font-semibold" : "text-muted-foreground"}>{part}</span>
            </span>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <div className="text-sm">
            <span className="font-semibold">
              {summary.green}/{summary.count}
            </span>{" "}
            <span className="text-muted-foreground">{mode === "period" ? "cardholders ready" : "statements ready"}</span>
          </div>
          <div className="text-sm">
            <span className={cn("font-semibold", summary.missing > 0 && "text-red-600")}>{summary.missing}</span>{" "}
            <span className="text-muted-foreground">receipts missing</span>
          </div>
          <Button variant="outline" size="sm" onClick={nextIncomplete} disabled={queue.incomplete.length === 0}>
            Next incomplete
          </Button>
          <ThresholdsDialog thresholds={thresholds} onSaved={setThresholds} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {legend.map((item) => (
          <span key={item.level} className="flex items-center gap-1.5">
            <LevelDot level={item.level} className="size-2" />
            {item.text}
          </span>
        ))}
      </div>

      <div className="grid overflow-hidden rounded-lg border bg-background lg:h-[calc(100vh-18rem)] lg:min-h-[560px] lg:grid-cols-[250px_350px_minmax(0,1fr)]">
        {/* Column 1: period or cardholder */}
        <section aria-label="Period or cardholder" className="overflow-y-auto border-b max-lg:max-h-80 lg:border-b-0 lg:border-r">
          <ColumnHeader>
            <div className="flex gap-1">
              <Button size="sm" variant={mode === "period" ? "secondary" : "ghost"} onClick={() => setMode("period")}>
                By period
              </Button>
              <Button size="sm" variant={mode === "person" ? "secondary" : "ghost"} onClick={() => setMode("person")}>
                By cardholder
              </Button>
            </div>
          </ColumnHeader>

          {mode === "period" ? (
            <>
              {tree.map((year, index) => {
                const open = openYears[year.year] ?? index === 0
                return (
                  <div key={year.year}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenYears((current) => ({ ...current, [year.year]: !open }))}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold hover:bg-muted/60"
                    >
                      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      <span className="flex-1">{year.year}</span>
                      <span className="text-xs font-normal text-muted-foreground">{rollup(year.groups, thresholds).missing} missing</span>
                    </button>
                    {open
                      ? year.months.map((node) => {
                          const roll = rollup(node.groups, thresholds)
                          return (
                            <QueueRow
                              key={node.month ?? "none"}
                              indent
                              selected={node.month === month}
                              muted={roll.green === roll.count}
                              onClick={() => chooseMonth(node.month)}
                            >
                              <LevelDot level={roll.level} />
                              <div className="min-w-0 flex-1">
                                <div>{node.month ? monthName(node.month) : "Unknown period"}</div>
                                <Mix groups={node.groups} thresholds={thresholds} />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {roll.green}/{roll.count} ready
                              </span>
                            </QueueRow>
                          )
                        })
                      : null}
                  </div>
                )
              })}
              {loadingOlder || olderFailed ? (
                <LoadingEarlier
                  failed={olderFailed}
                  label="Loading earlier months"
                  onRetry={() => setOlderFailed(false)}
                />
              ) : null}
            </>
          ) : (
            <>
              <div className="border-b p-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search cardholder"
                  aria-label="Search cardholder"
                  className="h-8"
                />
              </div>
              {[...peopleIncomplete, ...(showCompletePeople || needle ? peopleComplete : [])].map((person) => (
                <QueueRow
                  key={person.id}
                  selected={person.id === personId}
                  muted={person.incomplete === 0}
                  onClick={() => choosePerson(person.id)}
                >
                  <LevelDot level={person.worst} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{person.name}</div>
                    <div className="mt-1.5 flex gap-0.5" aria-hidden="true">
                      {stripMonths.map((stripMonth) => {
                        const cell = byKey.get(`${person.id}|${stripMonth}`)
                        return (
                          <span
                            key={stripMonth}
                            className={cn("h-1.5 w-2 rounded-sm", cell ? LEVEL_BG[groupLevel(cell, thresholds)] : "bg-muted")}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {person.incomplete === 0 ? "complete" : `${person.incomplete} incomplete`}
                  </span>
                </QueueRow>
              ))}
              {peopleComplete.length > 0 && !needle ? (
                <FoldRow
                  label={`Complete (${peopleComplete.length})`}
                  open={showCompletePeople}
                  onClick={() => setShowCompletePeople((value) => !value)}
                />
              ) : null}
              {loadingOlder || olderFailed ? (
                <LoadingEarlier
                  failed={olderFailed}
                  label="Loading earlier statements"
                  onRetry={() => setOlderFailed(false)}
                />
              ) : null}
            </>
          )}
        </section>

        {/* Column 2: cardholders in the month, or the person's statements */}
        <section aria-label="Statements" className="overflow-y-auto border-b max-lg:max-h-80 lg:border-b-0 lg:border-r">
          <ColumnHeader>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="truncate text-sm font-semibold">
                {mode === "period" ? `Cardholders, ${monthLabel(month)}` : `${personName}, statements`}
              </div>
              {mode === "period" ? (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" className="h-6 px-2" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setFilter("all")}>
                    All {summary.count}
                  </Button>
                  {LEVELS.map((level) => (
                    <Button
                      key={level}
                      size="sm"
                      className="h-6 gap-1.5 px-2"
                      variant={filter === level ? "secondary" : "ghost"}
                      onClick={() => setFilter(level)}
                      aria-label={`${level} ${summary[level]}`}
                    >
                      <LevelDot level={level} className="size-2" />
                      {summary[level]}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </ColumnHeader>

          {shownIncomplete.map((group) => renderStatementRow(group, false))}
          {shownIncomplete.length === 0 && shownComplete.length === 0 && !loadingOlder ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">Nothing here for this filter.</p>
          ) : null}
          {shownIncomplete.length === 0 && queue.incomplete.length === 0 && filter === "all" && shownComplete.length > 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Everything here is complete.</p>
          ) : null}
          {shownComplete.length > 0 ? (
            <>
              {mode === "period" && filter === "all" ? (
                <FoldRow
                  label={`Complete (${shownComplete.length})`}
                  open={completeOpen}
                  onClick={() => setShowComplete((value) => !value)}
                />
              ) : mode === "person" ? (
                <FoldRow
                  label={`Complete (${shownComplete.length})`}
                  open={completeOpen}
                  onClick={() => setShowComplete((value) => !value)}
                />
              ) : null}
              {completeOpen ? shownComplete.map((group) => renderStatementRow(group, true)) : null}
            </>
          ) : null}
          {mode === "person" && (loadingOlder || olderFailed) ? (
            <LoadingEarlier
              failed={olderFailed}
              label="Loading earlier statements"
              onRetry={() => setOlderFailed(false)}
            />
          ) : null}
        </section>

        {/* Column 3: the statement */}
        <section aria-label="Statement" className="overflow-y-auto p-4">
          {selected ? (
            <StatementDetail
              key={selected.key}
              group={selected}
              thresholds={thresholds}
              detail={selKey ? details[selKey] : undefined}
              onRetry={retryDetail}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {mode === "period" ? "Choose a cardholder to see their statement." : "Choose a statement to see its transactions."}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
