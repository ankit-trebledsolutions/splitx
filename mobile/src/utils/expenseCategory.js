// Ionicons glyph per expense category (see the Expense model's category enum).
export const CATEGORY_ICON = {
  food: 'restaurant-outline',
  stay: 'bed-outline',
  travel: 'train-outline',
  transport: 'train-outline',
  housing: 'bed-outline',
  fun: 'beer-outline',
  entertainment: 'beer-outline',
  shopping: 'cart-outline',
  utilities: 'flash-outline',
  general: 'receipt-outline',
  other: 'receipt-outline',
};

export const categoryIcon = (category) => CATEGORY_ICON[category] ?? 'receipt-outline';
