import ExcelJS from "exceljs";

export type StockReportProduct = {
  name: string;
  brand: string;
  category: string;
  sku?: string | null;
  zoho_product_id?: string | null;
  price: number;
  stock: number;
  is_active?: boolean;
  size_stock?: Record<string, number>;
  product_type?: "shoe" | "racquet" | "other";
  zoho_stock_synced_at?: string | null;
};

const shoeSizes = Array.from({ length: 14 }, (_, index) => `UK ${index + 1}`);

function isShoe(product: StockReportProduct) {
  return product.product_type ? product.product_type === "shoe" : /shoe|sneaker/i.test(product.name);
}

function isRacquet(product: StockReportProduct) {
  return product.product_type === "racquet";
}

function syncDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

function styleWorksheet(worksheet: ExcelJS.Worksheet) {
  worksheet.views = [{ state: "frozen", ySplit: 1, xSplit: 3, showGridLines: false }];
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
      cell.alignment = { vertical: "middle" };
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

export function createStockReportWorkbook(products: StockReportProduct[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Raed Sports Admin";
  workbook.subject = "Current product stock report";
  workbook.title = "Al Raed Sports Stock Report";
  workbook.created = new Date();
  workbook.modified = new Date();

  const shoes = products.filter(isShoe);
  const rackets = products.filter(isRacquet);
  const shoeSheet = workbook.addWorksheet("Shoes", { properties: { tabColor: { argb: "FF3478B7" } } });
  shoeSheet.columns = [
    { header: "S.no", key: "serial", width: 9 },
    { header: "Name", key: "name", width: 32 },
    { header: "Zoho ID", key: "zohoId", width: 20 },
    ...shoeSizes.map((size) => ({ header: size, key: size, width: 10 })),
    { header: "Other sizes stock", key: "otherSizes", width: 16 },
    { header: "Total stock", key: "totalStock", width: 13 },
    { header: "Brand", key: "brand", width: 18 },
    { header: "Category", key: "category", width: 16 },
    { header: "Price (AED)", key: "price", width: 14 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Visibility", key: "visibility", width: 12 },
    { header: "Last Zoho sync", key: "syncedAt", width: 22 },
  ];
  shoeSheet.addRows(shoes.map((product, index) => {
    const sizeStock = product.size_stock ?? {};
    const otherSizesStock = Object.entries(sizeStock)
      .filter(([size]) => !shoeSizes.includes(size))
      .reduce((total, [, quantity]) => total + Math.max(0, Number(quantity) || 0), 0);

    return {
      serial: index + 1,
      name: product.name,
      zohoId: product.zoho_product_id || "",
      ...Object.fromEntries(shoeSizes.map((size) => [size, Math.max(0, Number(sizeStock[size]) || 0)])),
      otherSizes: otherSizesStock,
      totalStock: Math.max(0, Number(product.stock) || 0),
      brand: product.brand,
      category: product.category,
      price: Number(product.price) || 0,
      sku: product.sku || "",
      visibility: product.is_active === false ? "Hidden" : "Live",
      syncedAt: syncDate(product.zoho_stock_synced_at),
    };
  }));
  shoeSheet.getColumn("price").numFmt = '"AED" #,##0.00';
  shoeSheet.getColumn("syncedAt").numFmt = "dd mmm yyyy, hh:mm";
  shoeSizes.forEach((size) => {
    shoeSheet.getColumn(size).numFmt = "#,##0";
  });
  shoeSheet.getColumn("otherSizes").numFmt = "#,##0";
  shoeSheet.getColumn("totalStock").numFmt = "#,##0";
  styleWorksheet(shoeSheet);

  const racketSheet = workbook.addWorksheet("Rackets", { properties: { tabColor: { argb: "FF4B9165" } } });
  racketSheet.columns = [
    { header: "S.no", key: "serial", width: 9 },
    { header: "Name", key: "name", width: 34 },
    { header: "Zoho ID", key: "zohoId", width: 20 },
    { header: "Quantity available", key: "quantity", width: 20 },
    { header: "Brand", key: "brand", width: 18 },
    { header: "Category", key: "category", width: 16 },
    { header: "Price (AED)", key: "price", width: 14 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Visibility", key: "visibility", width: 12 },
    { header: "Last Zoho sync", key: "syncedAt", width: 22 },
  ];
  racketSheet.addRows(rackets.map((product, index) => ({
    serial: index + 1,
    name: product.name,
    zohoId: product.zoho_product_id || "",
    quantity: Math.max(0, Number(product.stock) || 0),
    brand: product.brand,
    category: product.category,
    price: Number(product.price) || 0,
    sku: product.sku || "",
    visibility: product.is_active === false ? "Hidden" : "Live",
    syncedAt: syncDate(product.zoho_stock_synced_at),
  })));
  racketSheet.getColumn("price").numFmt = '"AED" #,##0.00';
  racketSheet.getColumn("quantity").numFmt = "#,##0";
  racketSheet.getColumn("syncedAt").numFmt = "dd mmm yyyy, hh:mm";
  styleWorksheet(racketSheet);

  return workbook;
}

export async function downloadStockReport(products: StockReportProduct[]) {
  const workbook = createStockReportWorkbook(products);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = `al-raed-stock-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  return {
    shoeCount: products.filter(isShoe).length,
    racketCount: products.filter(isRacquet).length,
  };
}
