import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { Amplify } from 'aws-amplify';
import './index.css'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-west-2_iKAmeDPx7',
      userPoolClientId: '10pialge0nsv0cgc01e4nc0b2a',
    }
  }
});
import { setApiUrl } from './services/api';

// Initialize production API endpoint if not in Demo Mode
const currentApi = localStorage.getItem('secureVault_apiUrl');
if (!currentApi || currentApi.includes('your-api-id') || (currentApi !== 'DEMO_MODE' && !localStorage.getItem('secureVault_isGuest'))) {
  setApiUrl('https://3qlauzvelj.execute-api.us-west-2.amazonaws.com/prod/');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
