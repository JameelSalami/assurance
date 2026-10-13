export const price = (cents,discount) => cents >= 100 ? cents - discount : cents;
