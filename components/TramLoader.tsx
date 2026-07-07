'use client'

import { useEffect, useRef, useState } from 'react'

export function TramLoader({ loading }: { loading: boolean }) {
  const [visible, setVisible]   = useState(false)
  const [exiting, setExiting]   = useState(false)
  const dataReadyRef  = useRef(false)
  const triggeredRef  = useRef(false)

  useEffect(() => {
    if (loading) {
      dataReadyRef.current = false
      triggeredRef.current = false
      setExiting(false)
      // Only show if loading takes > 150 ms — avoids flash on ISR cache hit
      const t = setTimeout(() => setVisible(true), 150)
      return () => clearTimeout(t)
    } else {
      dataReadyRef.current = true
      // Visible overlay exits on the next animationiteration (≤ 2.6 s away)
    }
  }, [loading])

  function handleIteration() {
    if (!dataReadyRef.current || triggeredRef.current) return
    triggeredRef.current = true
    setExiting(true)
    setTimeout(() => { setVisible(false); setExiting(false) }, 450)
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: '#0a0a0c', overflow: 'hidden',
        transition: 'opacity 0.4s ease',
        opacity: exiting ? 0 : 1,
      }}
    >
      <style>{`
        @keyframes tramLoop {
          from { left: -340px; }
          to   { left: calc(100% + 30px); }
        }
        @keyframes tramTextIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tramDot {
          0%, 60%, 100% { opacity: 0; }
          30% { opacity: 1; }
        }
      `}</style>

      {/* Track rails */}
      <div style={{ position: 'absolute', top: 'calc(50% + 47px)', left: 0, right: 0 }}>
        <div style={{ height: '1.5px', background: 'rgba(107,118,255,0.14)', marginBottom: 8 }} />
        <div style={{ height: '1.5px', background: 'rgba(107,118,255,0.14)' }} />
      </div>

      {/* Tram */}
      <div
        onAnimationIteration={handleIteration}
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: '-340px',
          filter: 'drop-shadow(-8px 0 12px rgba(107,118,255,0.2))',
          animation: 'tramLoop 2.6s linear infinite',
        }}
      >
        <svg viewBox="0 0 318 94" width="318" height="94" xmlns="http://www.w3.org/2000/svg">
          {/* Pantograph */}
          <rect x="108" y="14" width="16" height="4" rx="1.5" fill="#1e1b3a"/>
          <rect x="190" y="14" width="16" height="4" rx="1.5" fill="#1e1b3a"/>
          <line x1="0"   y1="3" x2="318" y2="3" stroke="rgba(107,118,255,.07)" strokeWidth="1"/>
          <line x1="116" y1="14" x2="136" y2="5"  stroke="#6b76ff" strokeWidth="1.4" strokeLinecap="round" opacity=".75"/>
          <line x1="136" y1="5"  x2="154" y2="3"  stroke="#6b76ff" strokeWidth="1.4" opacity=".85"/>
          <line x1="154" y1="3"  x2="178" y2="3"  stroke="#6b76ff" strokeWidth="2.2" opacity=".95" strokeLinecap="round"/>
          <line x1="178" y1="3"  x2="196" y2="5"  stroke="#6b76ff" strokeWidth="1.4" opacity=".85"/>
          <line x1="196" y1="5"  x2="198" y2="14" stroke="#6b76ff" strokeWidth="1.4" strokeLinecap="round" opacity=".75"/>
          <line x1="136" y1="5"  x2="198" y2="14" stroke="#6b76ff" strokeWidth=".7" opacity=".35"/>
          <line x1="116" y1="14" x2="196" y2="5"  stroke="#6b76ff" strokeWidth=".7" opacity=".35"/>
          <circle cx="116" cy="14" r="2.5" fill="#6b76ff" opacity=".7"/>
          <circle cx="198" cy="14" r="2.5" fill="#6b76ff" opacity=".7"/>
          <line x1="154" y1="3" x2="178" y2="3" stroke="rgba(107,118,255,.5)" strokeWidth="5" strokeLinecap="round"/>
          {/* Roof */}
          <rect x="48" y="14" width="222" height="5" fill="#1f1c3c"/>
          <rect x="80" y="14" width="154" height="2" rx="1" fill="#2a2756"/>
          {/* Body */}
          <rect x="4" y="18" width="310" height="52" rx="2" fill="#18162c"/>
          {/* Front nose */}
          <path d="M4,18 L52,18 L46,54 L4,54 Z" fill="#1c1a32"/>
          {/* Windshield */}
          <path d="M10,21 L47,21 L42,50 L10,50 Z" fill="rgba(107,118,255,.14)" stroke="rgba(107,118,255,.4)" strokeWidth=".8"/>
          <line x1="28" y1="21" x2="26" y2="50" stroke="rgba(107,118,255,.22)" strokeWidth=".6"/>
          <path d="M13,49 Q25,30 43,22" fill="none" stroke="rgba(107,118,255,.18)" strokeWidth=".7"/>
          {/* Headlights */}
          <circle cx="14" cy="61" r="7"   fill="#0d0b1e" stroke="rgba(200,180,80,.55)" strokeWidth="1.3"/>
          <circle cx="14" cy="61" r="4.5" fill="rgba(255,210,80,.25)"/>
          <circle cx="14" cy="61" r="2.5" fill="rgba(255,230,130,.6)"/>
          <rect x="7" y="65" width="20" height="2" rx="1" fill="rgba(255,200,80,.35)"/>
          <circle cx="32" cy="63" r="4.5" fill="#0d0b1e" stroke="rgba(200,180,80,.4)" strokeWidth="1"/>
          <circle cx="32" cy="63" r="2.5" fill="rgba(255,200,80,.25)"/>
          {/* Route board */}
          <rect x="4" y="18" width="46" height="18" rx="2" fill="#5059e6"/>
          <text x="27" y="31" fill="white" fontSize="13" fontWeight="900" fontFamily="-apple-system,system-ui" textAnchor="middle">3</text>
          <text x="27" y="40" fill="rgba(255,255,255,.5)" fontSize="5.5" fontWeight="700" fontFamily="system-ui" textAnchor="middle" letterSpacing=".05em">RAUTATIEASEMA</text>
          {/* Main windows */}
          <rect x="54" y="20" width="196" height="34" rx="2.5" fill="rgba(107,118,255,.11)" stroke="rgba(107,118,255,.32)" strokeWidth=".8"/>
          <rect x="56" y="22" width="6" height="30" rx="1" fill="rgba(255,255,255,.02)"/>
          <line x1="106" y1="20" x2="106" y2="54" stroke="rgba(107,118,255,.28)" strokeWidth="1"/>
          <line x1="155" y1="20" x2="155" y2="54" stroke="rgba(107,118,255,.28)" strokeWidth="1"/>
          <line x1="204" y1="20" x2="204" y2="54" stroke="rgba(107,118,255,.28)" strokeWidth="1"/>
          <text x="154" y="40" fill="rgba(255,255,255,.9)" fontSize="10.5" fontWeight="900" fontFamily="-apple-system,BlinkMacSystemFont,system-ui,sans-serif" textAnchor="middle" letterSpacing="-.3">Mitä tänään?</text>
          {/* Rear window */}
          <rect x="258" y="20" width="52" height="34" rx="2.5" fill="rgba(107,118,255,.08)" stroke="rgba(107,118,255,.2)" strokeWidth=".8"/>
          <rect x="260" y="22" width="4" height="30" rx="1" fill="rgba(255,255,255,.02)"/>
          {/* Tail lights */}
          <circle cx="300" cy="61" r="6.5" fill="#0d0b1e" stroke="rgba(200,40,40,.5)" strokeWidth="1.2" opacity=".75"/>
          <circle cx="300" cy="61" r="4"   fill="rgba(180,30,30,.35)" opacity=".75"/>
          <circle cx="300" cy="61" r="2"   fill="rgba(220,50,50,.55)" opacity=".75"/>
          <rect x="286" y="65" width="22" height="2" rx="1" fill="rgba(180,30,30,.3)" opacity=".75"/>
          {/* Door */}
          <rect x="206" y="54" width="48" height="16" rx="0" fill="#0f0e1e"/>
          <line x1="230" y1="54" x2="230" y2="70" stroke="rgba(107,118,255,.22)" strokeWidth=".8"/>
          <rect x="209" y="56" width="19" height="10" rx="1.5" fill="rgba(107,118,255,.08)" stroke="rgba(107,118,255,.15)" strokeWidth=".5"/>
          <rect x="231" y="56" width="19" height="10" rx="1.5" fill="rgba(107,118,255,.08)" stroke="rgba(107,118,255,.15)" strokeWidth=".5"/>
          <rect x="206" y="68" width="48" height="4" fill="#0c0b18"/>
          {/* Stripe */}
          <rect x="4" y="67" width="310" height="3.5" fill="#6b76ff" opacity=".7"/>
          {/* Skirt */}
          <rect x="4" y="70" width="310" height="6" fill="#13112a"/>
          <rect x="90"  y="72" width="20" height="1.5" rx=".75" fill="rgba(107,118,255,.15)"/>
          <rect x="116" y="72" width="20" height="1.5" rx=".75" fill="rgba(107,118,255,.15)"/>
          <rect x="180" y="72" width="20" height="1.5" rx=".75" fill="rgba(107,118,255,.15)"/>
          {/* Left bogie */}
          <rect x="28" y="74" width="72" height="7" rx="3.5" fill="#0c0b1a"/>
          <rect x="36" y="77" width="56" height="2" rx="1" fill="#1a1838"/>
          <circle cx="46"  cy="84" r="10" fill="#0a0919" stroke="#1c1a34" strokeWidth="1.5"/>
          <circle cx="46"  cy="84" r="5.5" fill="#121028"/>
          <circle cx="46"  cy="84" r="1.8" fill="#1e1c36"/>
          <line x1="46" y1="76" x2="46" y2="92" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
          <line x1="38" y1="84" x2="54" y2="84" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
          <circle cx="82"  cy="84" r="10" fill="#0a0919" stroke="#1c1a34" strokeWidth="1.5"/>
          <circle cx="82"  cy="84" r="5.5" fill="#121028"/>
          <circle cx="82"  cy="84" r="1.8" fill="#1e1c36"/>
          <line x1="82" y1="76" x2="82" y2="92" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
          <line x1="74" y1="84" x2="90" y2="84" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
          {/* Right bogie */}
          <rect x="218" y="74" width="72" height="7" rx="3.5" fill="#0c0b1a"/>
          <rect x="226" y="77" width="56" height="2" rx="1" fill="#1a1838"/>
          <circle cx="232" cy="84" r="10" fill="#0a0919" stroke="#1c1a34" strokeWidth="1.5"/>
          <circle cx="232" cy="84" r="5.5" fill="#121028"/>
          <circle cx="232" cy="84" r="1.8" fill="#1e1c36"/>
          <line x1="232" y1="76" x2="232" y2="92" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
          <line x1="224" y1="84" x2="240" y2="84" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
          <circle cx="270" cy="84" r="10" fill="#0a0919" stroke="#1c1a34" strokeWidth="1.5"/>
          <circle cx="270" cy="84" r="5.5" fill="#121028"/>
          <circle cx="270" cy="84" r="1.8" fill="#1e1c36"/>
          <line x1="270" y1="76" x2="270" y2="92" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
          <line x1="262" y1="84" x2="278" y2="84" stroke="#1a1834" strokeWidth="1" opacity=".6"/>
        </svg>
      </div>

      {/* Loading text */}
      <p style={{
        position: 'absolute', bottom: 100, left: 0, right: 0,
        textAlign: 'center', fontSize: 13, fontWeight: 700,
        color: 'rgba(255,255,255,0.28)', letterSpacing: '-0.01em',
        animation: 'tramTextIn 0.4s ease 0.5s both',
      }}>
        Haetaan Helsingin parhaat menot
        <span style={{ animation: 'tramDot 1.4s ease-in-out 1s infinite', opacity: 0 }}>.</span>
        <span style={{ animation: 'tramDot 1.4s ease-in-out 1.2s infinite', opacity: 0 }}>.</span>
        <span style={{ animation: 'tramDot 1.4s ease-in-out 1.4s infinite', opacity: 0 }}>.</span>
      </p>
    </div>
  )
}
