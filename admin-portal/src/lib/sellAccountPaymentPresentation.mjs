export const getSellAccountPaymentBalances = ({ purchaserBalance = 0, sellerBalance = 0 } = {}) => ({
  customer: { label: 'Balance', amount: Number(purchaserBalance || 0) },
  seller: { label: 'Balance', amount: Number(sellerBalance || 0) },
});
