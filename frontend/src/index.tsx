import ReactDOM from 'react-dom/client';
import { BrowserRouter } from "react-router-dom"
import './index.scss';
import App from './App';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import {
  QueryClientProvider,
} from '@tanstack/react-query'
import { queryClient } from './js/utils';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <QueryClientProvider client={queryClient}>
    <MantineProvider defaultColorScheme="dark">
        <Notifications />
        <BrowserRouter>
          <App />
        </BrowserRouter>
    </MantineProvider>
  </QueryClientProvider>
);
