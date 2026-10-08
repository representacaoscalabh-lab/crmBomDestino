# Dashboard Date Filtering - Fix & Re-Import Instructions

## 📋 Summary of Changes

The dashboard had a critical bug where:
- Orders with dates in June 2026 were showing as distributed across May, August, and December
- "Peso Ano" didn't match "Peso Mês Selecionado" for single-month data
- Date parsing failed silently for Excel serial numbers

### ✅ Fixed Issues

**Root Cause**: Excel stores dates as serial numbers (days since 1900). The system wasn't converting these properly, causing:
- `46583` (June 1, 2026 as Excel serial) was being parsed incorrectly
- Dashboard filters couldn't properly match dates
- Monthly weight aggregation split data across wrong months

### 🔧 Code Changes

1. **`src/lib/order-service.ts`**
   - Added `excelSerialToDate(serial)` - converts Excel serial numbers to JavaScript Date
   - Added `normalizeDateToISO(value)` - robust parser that handles:
     - ISO format: `2026-06-01`
     - Excel serials: `46583`
     - Brazilian format: `01/06/2026`, `01-06-2026`
   - All order imports now normalize dates to ISO format (`YYYY-MM-DD`)

2. **`src/app/dashboard/page.tsx`**
   - Enhanced `parseDate()` with Excel serial support
   - Fixed `monthlyWeights` to filter by selected year first

3. **`src/app/dashboard/pedidos/page.tsx`**
   - Improved `parseOrderDate()` with robust parsing

## 🚨 Important: Clean Up Corrupted Data

Your existing orders in Firebase may have corrupted date values. To fix:

### Option A: Delete & Re-import (RECOMMENDED)

1. **Delete all existing orders in Firestore**
   - Go to Firestore Console → `orders` collection
   - Select all documents (use bulk delete if available)
   - Or go to `configuracoes` page and delete via admin interface

2. **Re-import your original Excel file**
   - Go to Pedidos page
   - Click "Importar Pedidos"
   - Select your original XLSX file
   - New import will use corrected date parsing

### Option B: Manual Check (if data is important)

If you want to keep existing orders:
1. Export current orders to XLSX
2. Open in Excel and verify all dates are correct
3. If dates look wrong, proceed with Option A

## 📊 Verification Steps

After re-importing, verify the fix:

1. **Dashboard Check**
   ```
   - Go to Métricas de vendas e performance
   - Select June 2026 as period
   - Verify "Peso Mês Selecionado" ≈ "Peso Ano" (should be similar if only June has data)
   - Monthly weight chart should show data ONLY in June bar
   ```

2. **No More Split Data**
   ```
   - The monthly chart should NOT show data in May, August, or December
   - All weight should concentrate in June
   ```

3. **Filter Consistency**
   ```
   - Apply date filter: 01/06/2026 to 31/06/2026
   - Results should match the default month view
   - Filter by previous month (May) should show 0 orders
   ```

## 🔐 Data Recovery Notes

- **Soft Delete**: Orders use soft delete (marked as `deleted: true`)
- **Audit Trail**: All orders keep `createdAt` timestamp
- **Permanent Deletion**: Only delete if you're absolutely sure

## 📝 New Import Format

The system now correctly handles these date formats in Excel:
- ✅ `01/06/2026` (Brazilian format)
- ✅ `01-06-2026` (with dashes)
- ✅ `2026-06-01` (ISO format)
- ✅ Excel date cells (automatically converted)

## 🆘 Troubleshooting

If metrics still show wrong values after re-import:

1. **Clear browser cache**
   - Press Ctrl+Shift+Delete
   - Clear cached images/files
   - Refresh dashboard

2. **Check Firebase data**
   - Firestore Console → `orders` collection
   - Click one order and verify `issueDate` is in format `YYYY-MM-DD`
   - Should be `2026-06-01` for June 1st, not `46583`

3. **Reload page**
   - The dashboard loads data fresh on mount
   - No stale data should persist

## 📞 Support

If issues persist after these steps:
1. Note the specific month/year showing wrong data
2. Check 2-3 orders in Firebase to confirm `issueDate` format
3. Try export → reimport one batch of 10 orders to test

---

**Last Updated**: 2026-06-30
**Fix Version**: Complete date parsing refactor with Excel serial support
