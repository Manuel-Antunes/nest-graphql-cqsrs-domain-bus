'use client';

import { Component } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { ErrorNotice } from '@/app/_components/error-notice';

interface QueryErrorBoundaryProps {
  title: string;
  children: React.ReactNode;
}

type QueryErrorBoundaryState =
  | { failed: false }
  | { failed: true; error: unknown };

export class QueryErrorBoundary extends Component<
  QueryErrorBoundaryProps,
  QueryErrorBoundaryState
> {
  override state: QueryErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(error: unknown): QueryErrorBoundaryState {
    return { failed: true, error };
  }

  override render() {
    if (this.state.failed) {
      unstable_rethrow(this.state.error);
      return <ErrorNotice title={this.props.title} error={this.state.error} />;
    }
    return this.props.children;
  }
}
