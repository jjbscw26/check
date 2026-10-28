import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {installGoogleMapsErrorObserver} from './utils/googleMapsConfig';
import './index.css';

installGoogleMapsErrorObserver();

createRoot(document.getElementById('root')!).render(<App />);

