import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './tokens.css'
import './styles.css'
import './components.css'
import './routeLinks'

window.addEventListener('securitypolicyviolation', (e) => {
  console.error('CSP violation:', e.violatedDirective, e.blockedURI, e.originalPolicy)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
