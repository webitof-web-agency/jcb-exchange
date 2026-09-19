const fs = require('fs');

const file = 'frontend/src/components/layout/Footer.tsx';
let content = fs.readFileSync(file, 'utf8');

const jobsLink = `                  <Link href="/jobs" className="text-sm md:text-[15px] text-[#B3B3B3] hover:text-white transition-colors">{t('navbar.careers', 'Careers & Jobs')}</Link>`;

if (!content.includes('href="/jobs"')) {
  content = content.replace(
    "                  <Link href=\"#\" className=\"text-sm md:text-[15px] text-[#B3B3B3] hover:text-white transition-colors\">{t('footer.sellMachine')}</Link>\n                </ul>",
    "                  <Link href=\"#\" className=\"text-sm md:text-[15px] text-[#B3B3B3] hover:text-white transition-colors\">{t('footer.sellMachine')}</Link>\n" + jobsLink + "\n                </ul>"
  );
}

fs.writeFileSync(file, content);
console.log('Patched', file);
