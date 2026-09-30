import type { PropsWithChildren } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { FinanceProvider } from './FinanceProvider';

export function AppProviders({ children }: PropsWithChildren) {
  return <BrowserRouter><FinanceProvider>{children}</FinanceProvider></BrowserRouter>;
}
