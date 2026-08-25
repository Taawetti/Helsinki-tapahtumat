import HomeShell from '@/components/HomeShell'

// Sama sisältö ja sama datahaku kuin "/" — kieli tulee layoutin
// LanguageProviderilta (initial='en'), ei erillisestä hausta.
export default async function EnPage() {
  return <HomeShell />
}
