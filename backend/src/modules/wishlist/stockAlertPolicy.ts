export function shouldSendBackInStock(
  previousStock: number,
  nextStock: number,
): boolean {
  return previousStock <= 0 && nextStock > 0;
}
