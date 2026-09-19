const fs = require('fs');

const file = 'frontend/src/components/layout/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

const desktopCareersLink = `              <Link href="/jobs" className={\`transition-colors hover:text-white \${pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'text-[#FFC107] font-bold' : ''}\`}>{t('navbar.careers', 'Careers')}</Link>`;

// Insert into Desktop nav after sold-vehicles
if (!content.includes('href="/jobs"')) {
  content = content.replace(
    /(\<Link href="\/sold-vehicles".*?\>.*?\<\/Link\>)/,
    "$1\n" + desktopCareersLink
  );
  
  const mobileCareersLink = `          <Link href="/jobs" onClick={() => setIsMobileMenuOpen(false)} className={\`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors \${pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'}\`}><Briefcase size={18} className={pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'text-[#FFC107]' : 'text-gray-400'} /><span>{t('navbar.careers', 'Careers')}</span></Link>`;
  
  content = content.replace(
    /(\<Link\s+href="\/sold-vehicles"[\s\S]*?\<\/Link\>)/,
    "$1\n\n" + mobileCareersLink
  );

  fs.writeFileSync(file, content);
  console.log('Patched Navbar Careers Link');
}
