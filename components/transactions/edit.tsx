"use client"

import { deleteTransactionAction, saveTransactionAction } from "@/app/(app)/transactions/actions"
import { ItemsDetectTool } from "@/components/agents/items-detect"
import ToolWindow from "@/components/agents/tool-window"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { GlDepartmentPicker } from "@/components/transactions/gl-department-picker"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectProject } from "@/components/forms/select-project"
import { FormSelectType } from "@/components/forms/select-type"
import { NetAmountAfterGst } from "@/components/forms/net-amount-after-gst"
import { FormInput, FormTextarea } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { isFieldShownInForm } from "@/lib/field-validation"
import type { DepartmentSplit } from "@/lib/gl-resolve"
import type { GlOption, GlPicker } from "@/lib/gl-options"
import { TransactionData } from "@/models/transactions"
import { Currency, Field, Project, Transaction } from "@/prisma/client"
import { Loader2, Save, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { startTransition, useActionState, useEffect, useMemo, useState } from "react"

export default function TransactionEditForm({
  transaction,
  categories,
  picker,
  projects,
  currencies,
  fields,
  settings,
}: {
  transaction: Transaction
  categories: GlOption[]
  picker: GlPicker | null
  projects: Project[]
  currencies: Currency[]
  fields: Field[]
  settings: Record<string, string>
}) {
  const router = useRouter()
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteTransactionAction, null)
  const [saveState, saveAction, isSaving] = useActionState(saveTransactionAction, null)

  const extraFields = fields.filter((field) => field.isExtra)
  const [formData, setFormData] = useState({
    name: transaction.name || "",
    merchant: transaction.merchant || "",
    description: transaction.description || "",
    total: transaction.total ? transaction.total / 100 : 0.0,
    currencyCode: transaction.currencyCode || settings.default_currency,
    convertedTotal: transaction.convertedTotal ? transaction.convertedTotal / 100 : 0.0,
    convertedCurrencyCode: transaction.convertedCurrencyCode,
    type: transaction.type || "expense",
    categoryCode: transaction.categoryCode || settings.default_category,
    projectCode: transaction.projectCode || settings.default_project,
    issuedAt: transaction.issuedAt ? transaction.issuedAt.toISOString().slice(0, 10) : "",
    note: transaction.note || "",
    items: transaction.items || [],
    ...extraFields.reduce(
      (acc, field) => {
        acc[field.code] = transaction.extra?.[field.code as keyof typeof transaction.extra] || ""
        return acc
      },
      {} as Record<string, unknown>
    ),
  })

  const fieldMap = useMemo(() => {
    return fields.reduce(
      (acc, field) => {
        acc[field.code] = field
        return acc
      },
      {} as Record<string, Field>
    )
  }, [fields])

  const handleDelete = async () => {
    if (confirm("Are you sure? This will delete the transaction with all the files permanently")) {
      startTransition(async () => {
        await deleteAction(transaction.id)
        router.back()
      })
    }
  }

  useEffect(() => {
    if (saveState?.success) {
      router.back()
    }
  }, [saveState, router])

  return (
    <form action={saveAction} className="space-y-4">
      <input type="hidden" name="transactionId" value={transaction.id} />

      <FormInput
        title={fieldMap.name.name}
        name="name"
        defaultValue={formData.name}
        isRequired={fieldMap.name.isRequired}
      />

      {isFieldShownInForm(fieldMap.merchant) ? (
        <FormInput
          title={fieldMap.merchant.name}
          name="merchant"
          defaultValue={formData.merchant}
          isRequired={fieldMap.merchant.isRequired}
        />
      ) : (
        <input type="hidden" name="merchant" value={formData.merchant} />
      )}

      {isFieldShownInForm(fieldMap.description) ? (
        <FormInput
          title={fieldMap.description.name}
          name="description"
          defaultValue={formData.description}
          isRequired={fieldMap.description.isRequired}
        />
      ) : (
        <input type="hidden" name="description" value={formData.description} />
      )}

      <div className="flex flex-row gap-4">
        <FormInput
          title={fieldMap.total.name}
          type="number"
          step="0.01"
          name="total"
          value={formData.total || ""}
          onChange={(e) => {
            const next = parseFloat(e.target.value || "0")
            if (!Number.isNaN(next)) setFormData({ ...formData, total: next })
          }}
          className="w-32"
          isRequired={fieldMap.total.isRequired}
        />

        {isFieldShownInForm(fieldMap.currencyCode) ? (
          <FormSelectCurrency
            title={fieldMap.currencyCode.name}
            name="currencyCode"
            value={formData.currencyCode}
            onValueChange={(value) => {
              setFormData({ ...formData, currencyCode: value })
            }}
            currencies={currencies}
            isRequired={fieldMap.currencyCode.isRequired}
          />
        ) : (
          <input type="hidden" name="currencyCode" value={formData.currencyCode} />
        )}

        {isFieldShownInForm(fieldMap.type) ? (
          <FormSelectType
            title={fieldMap.type.name}
            name="type"
            defaultValue={formData.type}
            isRequired={fieldMap.type.isRequired}
          />
        ) : (
          <input type="hidden" name="type" value={formData.type} />
        )}

        <NetAmountAfterGst
          total={formData.total}
          vat={(formData as Record<string, unknown>).vat as string | number}
          vatRate={(formData as Record<string, unknown>).vat_rate as string | number}
        />
      </div>

      <div className="flex flex-row flex-grow gap-4">
        {isFieldShownInForm(fieldMap.issuedAt) ? (
          <FormInput
            title={fieldMap.issuedAt.name}
            type="date"
            name="issuedAt"
            defaultValue={formData.issuedAt}
            isRequired={fieldMap.issuedAt.isRequired}
          />
        ) : (
          <input type="hidden" name="issuedAt" value={formData.issuedAt} />
        )}
        {formData.currencyCode !== settings.default_currency || formData.convertedTotal !== 0 ? (
          <>
            {formData.convertedTotal !== null && isFieldShownInForm(fieldMap.convertedTotal) && (
              <FormInput
                title={`Total converted to ${formData.convertedCurrencyCode || "UNKNOWN CURRENCY"}`}
                type="number"
                step="0.01"
                name="convertedTotal"
                defaultValue={formData.convertedTotal.toFixed(2)}
                isRequired={fieldMap.convertedTotal.isRequired}
                className="max-w-36"
              />
            )}
            {formData.convertedTotal !== null && !isFieldShownInForm(fieldMap.convertedTotal) && (
              <input type="hidden" name="convertedTotal" value={formData.convertedTotal.toFixed(2)} />
            )}
            {(!formData.convertedCurrencyCode || formData.convertedCurrencyCode !== settings.default_currency) &&
              (isFieldShownInForm(fieldMap.convertedCurrencyCode) ? (
                <FormSelectCurrency
                  title="Convert to"
                  name="convertedCurrencyCode"
                  defaultValue={formData.convertedCurrencyCode || settings.default_currency}
                  currencies={currencies}
                  isRequired={fieldMap.convertedCurrencyCode.isRequired}
                />
              ) : (
                <input
                  type="hidden"
                  name="convertedCurrencyCode"
                  value={formData.convertedCurrencyCode || settings.default_currency}
                />
              ))}
          </>
        ) : (
          <></>
        )}
      </div>

      <div className="flex flex-row gap-4">
        {isFieldShownInForm(fieldMap.categoryCode) ? (
          picker ? (
            <div className="flex-1">
              <GlDepartmentPicker
                picker={picker}
                initialCode={transaction.glFieldKey || formData.categoryCode}
                initialSplits={transaction.departmentSplits as unknown as DepartmentSplit[] | null}
                title="Category"
              />
            </div>
          ) : (
            <FormSelectCategory
              title={fieldMap.categoryCode.name}
              categories={categories}
              name="categoryCode"
              defaultValue={formData.categoryCode}
              isRequired={fieldMap.categoryCode.isRequired}
            />
          )
        ) : (
          <input type="hidden" name="categoryCode" value={formData.categoryCode || ""} />
        )}

        {isFieldShownInForm(fieldMap.projectCode) ? (
          <FormSelectProject
            title={fieldMap.projectCode.name}
            projects={projects}
            name="projectCode"
            defaultValue={formData.projectCode}
            isRequired={fieldMap.projectCode.isRequired}
          />
        ) : (
          <input type="hidden" name="projectCode" value={formData.projectCode || ""} />
        )}
      </div>

      {isFieldShownInForm(fieldMap.note) ? (
        <FormTextarea
          title={fieldMap.note.name}
          name="note"
          defaultValue={formData.note}
          className="h-24"
          isRequired={fieldMap.note.isRequired}
        />
      ) : (
        <input type="hidden" name="note" value={formData.note} />
      )}

      <div className="flex flex-wrap gap-4">
        {extraFields.map((field) =>
          isFieldShownInForm(field) ? (
            <FormInput
              key={field.code}
              type="text"
              title={field.name}
              name={field.code}
              value={(formData[field.code as keyof typeof formData] as string) || ""}
              onChange={(e) => setFormData({ ...formData, [field.code]: e.target.value })}
              isRequired={field.isRequired}
              className={field.type === "number" ? "max-w-36" : "max-w-full"}
            />
          ) : (
            <input
              key={field.code}
              type="hidden"
              name={field.code}
              value={(formData[field.code as keyof typeof formData] as string) || ""}
            />
          )
        )}
      </div>

      {formData.items && Array.isArray(formData.items) && formData.items.length > 0 && (
        <ToolWindow title="Detected items">
          <ItemsDetectTool data={formData as TransactionData} />
        </ToolWindow>
      )}

      <div className="flex justify-between space-x-4 pt-6">
        <Button type="button" onClick={handleDelete} variant="destructive" disabled={isDeleting}>
          <>
            <Trash2 className="h-4 w-4" />
            {isDeleting ? "⏳ Deleting..." : "Delete "}
          </>
        </Button>

        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Transaction
            </>
          )}
        </Button>
      </div>

      <div>
        {deleteState?.error && <FormError>{deleteState.error}</FormError>}
        {saveState?.error && <FormError>{saveState.error}</FormError>}
      </div>
    </form>
  )
}
