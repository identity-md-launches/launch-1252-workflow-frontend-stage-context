import { createRoot } from 'react-dom/client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import './styles.css';
import { loadDeployment } from './config';
import App from './App';
class Boundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Error is displayed; no remote telemetry. */
  }
  render() {
    return this.state.error ? <Failure message={this.state.error} /> : this.props.children;
  }
}
function Failure({ message }: { message: string }) {
  return (
    <main className="boot-screen">
      <span className="brand">tithe.</span>
      <h1>Unable to load Tithe.</h1>
      <p role="alert">{message}</p>
      <p>
        Transaction controls are unavailable until the deployment configuration loads successfully.
      </p>
      <button onClick={() => location.reload()}>Reload page</button>
    </main>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(
  <main className="boot-screen">
    <span className="brand">tithe.</span>
    <p role="status">Checking deployment configuration and ABI integrity…</p>
  </main>,
);
loadDeployment()
  .then((d) =>
    root.render(
      <Boundary>
        <App d={d} />
      </Boundary>,
    ),
  )
  .catch((e) => root.render(<Failure message={e.message} />));
