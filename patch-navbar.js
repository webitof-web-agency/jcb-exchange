const fs = require('fs');

const file = 'frontend/src/components/layout/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add Briefcase to imports if missing
if (!content.includes('Briefcase')) {
  content = content.replace(
    "} from 'lucide-react';",
    ", Briefcase } from 'lucide-react';"
  );
}

// Add Desktop Careers Link
const desktopCareersLink = `              <Link
                href="/jobs"
                className={\`transition-colors hover:text-white \${pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'text-[#FFC107] font-bold' : ''}\`}
              >
                {t('navbar.careers', 'Careers')}
              </Link>`;
if (!content.includes('href="/jobs"')) {
  content = content.replace(
    "                {t('common.sellRentOut', 'Sell / Rent Out')}\n              </Link>",
    "                {t('common.sellRentOut', 'Sell / Rent Out')}\n              </Link>\n" + desktopCareersLink
  );
}

// Add Mobile Careers Link
const mobileCareersLink = `          <Link
            href="/jobs"
            onClick={() => setIsMobileMenuOpen(false)}
            className={\`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors \${pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'}\`}
          >
            <Briefcase size={18} className={pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.careers', 'Careers')}</span>
          </Link>`;
          
if (!content.includes('<span>{t(\'navbar.careers\', \'Careers\')}</span>')) {
  content = content.replace(
    "          <Link\n            href=\"/dealers\"",
    mobileCareersLink + "\n\n          <Link\n            href=\"/dealers\""
  );
}

fs.writeFileSync(file, content);
console.log('Patched', file);
