import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from './src/lib/prisma';

type IconSeed = {
  name: string;
  svgData: string;
};

const iconsDir = path.resolve(process.cwd(), 'assets', 'category-icons');

const fallbackIcons: IconSeed[] = [
  {
    name: 'Tractor',
    svgData: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tractor"><path d="M3 4h9l1 7"/><path d="M4 11V4"/><path d="M8 10V4"/><path d="M18 5c-.6 0-1 .4-1 1v5.6"/><path d="m10 11 11 .9c.6 0 .9.5.8 1.1l-.8 5h-1"/><circle cx="7" cy="15" r="5"/><circle cx="18" cy="18" r="2"/></svg>',
  },
  {
    name: 'Truck',
    svgData: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-truck"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11h2"/><path d="M15 18H9"/><path d="M19 18h2v-6l-3.4-5.1A2 2 0 0 0 16 6h-2v12h1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  },
  {
    name: 'Crane',
    svgData: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-construction"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 6 7.7 7.7"/><path d="m8 6 8 8"/></svg>',
  },
  {
    name: 'Excavator',
    svgData: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shovel"><path d="M2 22v-5l5-5 5 5-5 5z"/><path d="M9.5 14.5 16 8"/><path d="m17 2 5 5-.5.5a3.53 3.53 0 0 1-5 0s0 0 0 0a3.53 3.53 0 0 1 0-5L17 2"/></svg>',
  },
];

const sanitizeIconName = (fileName: string) =>
  fileName
    .replace(/\.svg$/i, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const readFolderSvgIcons = async (): Promise<IconSeed[]> => {
  const files = await fs.readdir(iconsDir, { withFileTypes: true });
  const svgFiles = files
    .filter((entry) => entry.isFile() && /\.svg$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));

  const icons = await Promise.all(
    svgFiles.map(async (fileName) => {
      const svgData = await fs.readFile(path.join(iconsDir, fileName), 'utf8');
      return {
        name: sanitizeIconName(fileName),
        svgData: svgData.trim(),
      };
    })
  );

  return icons;
};

async function seedIcons() {
  const folderIcons = await readFolderSvgIcons();
  const iconsByName = new Map<string, IconSeed>();

  for (const icon of [...fallbackIcons, ...folderIcons]) {
    iconsByName.set(icon.name, icon);
  }

  for (const icon of iconsByName.values()) {
    await prisma.categoryIcon.upsert({
      where: { name: icon.name },
      update: { svgData: icon.svgData },
      create: { name: icon.name, svgData: icon.svgData },
    });
  }

  console.log(`Seeded ${iconsByName.size} category icons successfully.`);
}

seedIcons()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
