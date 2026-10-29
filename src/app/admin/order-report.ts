import ExcelJS from "exceljs";

export type OrderReportItem = {
  id: number;
  product_id?: number | null;
  product_name: string;
  quantity: number;
  unit_price: number;
};

export type OrderReportOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  city: string | null;
  address: string | null;
  total: number;
  status: string;
  notes?: string | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
  stripe_payment_method: string | null;
  stripe_paid_at: string | null;
  order_items?: OrderReportItem[];
};

function toExcelDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

function styleWorksheet(worksheet: ExcelJS.Worksheet) {
  worksheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  worksheet.getRow(1).height = 28;
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173A5E" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: "FF4A83B7" } } };
  });

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5FA" } };
      }
    });
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(worksheet.rowCount, 1), column: worksheet.columnCount },
  };
}

export function createOrderReportWorkbook(orders: OrderReportOrder[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Raed Sports Admin";
  workbook.subject = "Customer order report";
  workbook.title = "Al Raed Sports Order Report";
  workbook.created = new Date();
  workbook.modified = new Date();

  const orderSheet = workbook.addWorksheet("Orders", { properties: { tabColor: { argb: "FF3478B7" } } });
  orderSheet.columns = [
    { header: "S.no", key: "serial", width: 9 },
    { header: "Order ID", key: "orderId", width: 30 },
    { header: "Order date", key: "createdAt", width: 22 },
    { header: "Customer name", key: "customer", width: 25 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "City", key: "city", width: 18 },
    { header: "Address", key: "address", width: 36 },
    { header: "Status", key: "status", width: 18 },
    { header: "Items", key: "itemCount", width: 10 },
    { header: "Order total (AED)", key: "total", width: 18 },
    { header: "Payment method", key: "paymentMethod", width: 20 },
    { header: "Paid at", key: "paidAt", width: 22 },
    { header: "Stripe reference", key: "paymentReference", width: 32 },
    { header: "Notes", key: "notes", width: 36 },
  ];
  orderSheet.addRows(orders.map((order, index) => ({
    serial: index + 1,
    orderId: order.id,
    createdAt: toExcelDate(order.created_at),
    customer: order.customer_name,
    phone: order.customer_phone,
    city: order.city || "",
    address: order.address || "",
    status: order.status.replace(/_/g, " "),
    itemCount: (order.order_items ?? []).reduce((count, item) => count + Math.max(0, Number(item.quantity) || 0), 0),
    total: Number(order.total) || 0,
    paymentMethod: order.stripe_payment_method || "",
    paidAt: toExcelDate(order.stripe_paid_at),
    paymentReference: order.stripe_payment_intent_id || "",
    notes: order.notes || "",
  })));
  orderSheet.getColumn("createdAt").numFmt = "dd mmm yyyy, hh:mm";
  orderSheet.getColumn("paidAt").numFmt = "dd mmm yyyy, hh:mm";
  orderSheet.getColumn("total").numFmt = '"AED" #,##0.00';
  orderSheet.getColumn("itemCount").numFmt = "#,##0";
  styleWorksheet(orderSheet);

  const itemSheet = workbook.addWorksheet("Order Items", { properties: { tabColor: { argb: "FF4B9165" } } });
  itemSheet.columns = [
    { header: "S.no", key: "serial", width: 9 },
    { header: "Order ID", key: "orderId", width: 30 },
    { header: "Product ID", key: "productId", width: 14 },
    { header: "Product", key: "product", width: 34 },
    { header: "Quantity", key: "quantity", width: 14 },
    { header: "Unit price (AED)", key: "unitPrice", width: 18 },
    { header: "Line total (AED)", key: "lineTotal", width: 18 },
  ];
  itemSheet.addRows(orders.flatMap((order) => (order.order_items ?? []).map((item) => ({
    orderId: order.id,
    productId: item.product_id ?? "",
    product: item.product_name,
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unit_price) || 0,
    lineTotal: (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
  }))).map((item, index) => ({ serial: index + 1, ...item })));
  itemSheet.getColumn("quantity").numFmt = "#,##0";
  itemSheet.getColumn("unitPrice").numFmt = '"AED" #,##0.00';
  itemSheet.getColumn("lineTotal").numFmt = '"AED" #,##0.00';
  styleWorksheet(itemSheet);

  return workbook;
}

export async function downloadOrderReport(orders: OrderReportOrder[]) {
  const workbook = createOrderReportWorkbook(orders);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = `al-raed-orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  return { orderCount: orders.length };
}
