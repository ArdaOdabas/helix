import React from 'react';

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Helix editor runtime error', error, info.componentStack);
    }
    render() {
        if (this.state.failed) {
            return <div className="error" role="alert"><h1>Helix encountered an error</h1><p>Reload the editor to reopen your saved document.</p><button onClick={() => window.location.reload()}>Reload editor</button></div>;
        }
        return this.props.children;
    }
}
