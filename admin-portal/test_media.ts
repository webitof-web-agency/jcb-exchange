import { getMediaSourceCandidates, getAbsoluteFileUrl } from './src/lib/fileUpload';

const fileUrl = 'https://drive.google.com/uc?id=1EA9QIp0B1N6UbnMHZMEJnfhn9j-PqJ2Z';

console.log('Original URL:', fileUrl);
console.log('Absolute URL:', getAbsoluteFileUrl(fileUrl));
console.log('Source Candidates:', getMediaSourceCandidates(fileUrl));
