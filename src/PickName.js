import React, { useState,  useContext  } from 'react';
import { ThemeContext } from './App';

export default function PickName({ curUser, setCurUser, nextStep }) {
  const [username, setUsername] = useState(curUser.username || '');
  const { isDarkMode } = useContext(ThemeContext);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    setCurUser({ ...curUser, username });
    nextStep();
  };

  return (
    <div className="pick-name-container">
      <h2>Pick Your Username</h2>
      <form onSubmit={handleNameSubmit}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          required
        />
        <button type="submit">Set Username</button>
      </form>
    </div>
  );
}