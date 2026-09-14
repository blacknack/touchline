import React, { useEffect } from 'react';
import { useStore } from './ui/store';
import { Layout } from './ui/Layout';
import { Start } from './ui/screens/Start';
import { Home } from './ui/screens/Home';
import { Squad } from './ui/screens/Squad';
import { Tactics } from './ui/screens/Tactics';
import { Fixtures } from './ui/screens/Fixtures';
import { Competitions } from './ui/screens/Competitions';
import { Transfers } from './ui/screens/Transfers';
import { Finances } from './ui/screens/Finances';
import { ClubScreen } from './ui/screens/Club';
import { Stats } from './ui/screens/Stats';
import { History } from './ui/screens/History';
import { Match } from './ui/screens/Match';
import { PlayerScreen } from './ui/screens/PlayerScreen';

export default function App() {
  const screen = useStore((s) => s.screen);
  const state = useStore((s) => s.state);
  const toast = useStore((s) => s.toast);
  useEffect(() => { document.title = state ? `Touchline — ${state.clubs[state.manager.clubId].name}` : 'Touchline Manager'; }, [state, screen]);
  if (!state || screen === 'start') return <><Start />{toast && <div className="toast">{toast}</div>}</>;
  const body = (() => {
    switch (screen) {
      case 'home': case 'inbox': return <Home />;
      case 'squad': return <Squad />;
      case 'tactics': return <Tactics />;
      case 'fixtures': return <Fixtures />;
      case 'competitions': return <Competitions />;
      case 'transfers': return <Transfers />;
      case 'finances': return <Finances />;
      case 'club': return <ClubScreen />;
      case 'stats': return <Stats />;
      case 'history': return <History />;
      case 'match': return <Match />;
      case 'player': return <PlayerScreen />;
      default: return <Home />;
    }
  })();
  return <Layout>{body}{toast && <div className="toast">{toast}</div>}</Layout>;
}
