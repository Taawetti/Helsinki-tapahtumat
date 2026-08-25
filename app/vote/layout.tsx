// /vote on jakolinkin laskeutumissivu: ryhmä äänestää pakan tapahtumista, ja
// sisältö tulee kokonaan URL-parametrista. Sivu ei ole itsenäistä sisältöä eikä
// kuulu hakuindeksiin. Sivu on 'use client', joten metadata tarvitsee layoutin.
//
// Ennen tätä sivu peri juurilayoutin canonicalin ja ilmoitti Googlelle olevansa
// etusivu (mitattu 25.8.2026).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function VoteLayout(props: LayoutProps<'/vote'>) {
  return <>{props.children}</>
}
