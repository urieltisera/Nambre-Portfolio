export function formatArsPrice(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "$ —";
  }
  const decimals = value.split(".")[1] ?? "";
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: decimals.length > 0 ? 2 : 0,
    minimumFractionDigits: decimals.length > 0 ? decimals.length : 0,
    style: "currency",
  }).format(amount);
}
