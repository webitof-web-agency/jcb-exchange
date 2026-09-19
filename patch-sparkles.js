const fs = require('fs');

const file = 'frontend/src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('Sparkles')) {
  content = content.replace(
    "} from 'lucide-react';",
    ", Sparkles } from 'lucide-react';"
  );
  fs.writeFileSync(file, content);
  console.log('Added Sparkles to lucide-react import');
} else {
  console.log('Sparkles already imported');
}
