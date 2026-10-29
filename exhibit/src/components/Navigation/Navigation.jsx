/**
 * Navigation. Public. Four places: the door, the wall, the machine, me.
 */
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks';
import { isDemo } from '../../services/demo/simService';
import './Navigation.css';

const LINKS = [
  { to: '/wall', label: 'הקיר' },
  { to: '/machine', label: 'המכונה' },
  { to: '/me', label: 'אני' },
];
if (isDemo()) LINKS.splice(1, 0, { to: '/lab', label: 'סימולטור' });

export const Navigation = () => {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  return (
    <nav className="navigation" aria-label="ניווט ראשי">
      <div className="navigation-container">
        <button type="button" className="navigation-brand" onClick={() => navigate('/')}>הרמס</button>
        <div className="navigation-links">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `navigation-link${isActive ? ' navigation-link--active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className="navigation-actions">
          {isAuthenticated
            ? <button type="button" className="navigation-link" onClick={async () => { await logout(); navigate('/'); }}>יציאה</button>
            : <NavLink to="/login" className="navigation-link">כניסה</NavLink>}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
