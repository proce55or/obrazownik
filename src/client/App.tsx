import { useEffect, useState } from 'react';

export function App() {
  const [connection, setConnection] = useState<'loading' | 'ok' | 'error'>('loading');
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/bootstrap').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(() => { if (active) setConnection('ok'); }).catch(() => { if (active) setConnection('error'); });
    return () => { active = false; };
  }, []);
  return <>
    <a className="skip-link" href="#main">Przejdź do treści</a>
    <header className="site-header"><a className="brand" href="/" aria-label="Obrazownik — strona główna"><img src="/favicon.svg" alt="" />obrazownik<span className="brand-dot">.</span></a><span className="header-note">Miejsce na własne słowa</span><span className="local-status"><i />Tylko na Twoim Macu</span></header>
    <main id="main" tabIndex={-1}>
      <div className="page-top"><span className="eyebrow">TWÓJ WŁASNY RYTM</span><span className="version">Pierwsze strony · wersja 0.1</span></div>
      {writing ? <section className="welcome"><button className="text-button" onClick={() => setWriting(false)}>← Wróć do Dzisiaj</button><h1>Od słowa do obrazu.</h1><p>Wybierz zwykły przedmiot w zasięgu wzroku. Zauważ jego kształt, fakturę lub dźwięk.</p><label htmlFor="draft">Co zauważasz?</label><textarea id="draft" placeholder="Zacznij od jednego szczegółu…" /><p className="fine-print">To ekran roboczy. Trwały zapis pojawi się w następnym etapie.</p></section> : <>
        <section className="welcome"><p className="small-heading">Dzisiaj</p><h1>Zatrzymaj się.<br />Zobacz coś <em>po swojemu.</em></h1><p className="intro">Czasem wystarczy jeden szczegół, żeby pojawił się obraz.<br className="desktop-break" /> Zostaw tu kilka własnych słów. Tyle, ile chcesz.</p></section>
        <section className="invitation" aria-labelledby="invitation-title"><div className="invitation-copy"><span className="eyebrow">NA POCZĄTEK · MAŁE ĆWICZENIE</span><h2 id="invitation-title">Od słowa do obrazu</h2><p>Weź zwyczajną rzecz i przyjrzyj się jej uważniej.<br />Co można zobaczyć, usłyszeć, poczuć?</p><button className="primary-button" disabled={connection !== 'ok'} onClick={() => setWriting(true)}>Zacznij pisać <span aria-hidden="true">↗</span></button><span className="button-note">Jedno zdanie też wystarczy.</span></div><div className="window-art" aria-hidden="true"><div className="sun" /><div className="hill hill-back" /><div className="hill hill-front" /><div className="window-line" /><div className="horizon" /><span className="art-caption">zauważ to, co blisko</span></div></section>
        <div className="quiet-grid"><section><span className="note-number">01 / ZAUWAŻ</span><h3>Bez pośpiechu</h3><p>Nie ma odliczania ani normy. Możesz napisać jedno zdanie i na tym skończyć.</p></section><section><span className="note-number">02 / SPRÓBUJ</span><h3>Własnym językiem</h3><p>Nie szukaj idealnych słów. Zwykłe, konkretne szczegóły są dobrym początkiem.</p></section><section><span className="note-number">03 / ZOSTAW ŚLAD</span><h3>Przestrzeń dla Ciebie</h3><p>Twoje teksty zostają na Twoim komputerze. Nie ma ocen, punktów ani porównań.</p></section></div>
      </>}
      <div role="status" className={connection === 'error' ? 'connection-error' : 'fine-print'}>{connection === 'error' ? 'Brak połączenia z lokalnym serwerem. Sprawdź, czy Obrazownik jest uruchomiony, i odśwież stronę.' : connection === 'loading' ? 'Łączenie z Twoją przestrzenią…' : ''}</div>
    </main><footer><span>Każdy obraz zaczyna się od zauważenia.</span><span>Prywatnie. Lokalnie. Po swojemu.</span></footer>
  </>;
}
