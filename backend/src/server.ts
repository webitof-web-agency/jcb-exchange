import app from './app';
import { startSoldListingRetentionJob } from './utils/soldListingRetention';

const PORT = process.env.PORT || 5000;

startSoldListingRetentionJob();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
