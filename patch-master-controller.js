const fs = require('fs');

const file = 'backend/src/controllers/master.controller.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Add getMobileAppSettings
const mobileAppLogic = `
export const getMobileAppSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.status(200).json({
      success: true,
      data: {
        playStoreLink: settings.mobileApp.playStoreLink,
        appStoreLink: settings.mobileApp.appStoreLink,
        updatedAt: settings.mobileApp.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};
`;
// Insert it before getFooterSettings or at the end
if (!content.includes('getMobileAppSettings')) {
  content = content + '\\n' + mobileAppLogic;
}

// 2. IP / Unique View Tracking for Machine Details
// In diff report:
//     const { id } = req.params;
//     // 2. IP / Unique View Tracking (24 hour limit)
//     const cacheKey = \`\${ip}_\${id}\`;
content = content.replace(
  "    const { id } = req.params;",
  "    const { id } = req.params;\n    // 2. IP / Unique View Tracking (24 hour limit)\n    const cacheKey = `${req.ip}_${id}`;"
);

// We need to also patch the sold price format if the user changed it.
// The diff shows:
// -        soldPrice: Number(listing.saleRecord.soldPrice),
// +        soldPrice: Number(listing.saleRecord.soldPrice || 0)
content = content.replace(
  "soldPrice: Number(listing.saleRecord.soldPrice),",
  "soldPrice: Number(listing.saleRecord.soldPrice || 0),"
);

fs.writeFileSync(file, content);
console.log('Patched', file);
