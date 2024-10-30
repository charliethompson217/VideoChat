import React, { useState, createContext } from 'react';
import PickName from './PickName';
import Lobby from './Lobby';
export const ThemeContext = createContext();

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [curUser, setCurUser] = useState({ userId: `USER${Date.now() + Math.random()}`, username: "", });

  const [isDarkMode] = useState(true);

  const steps = [
    { id: 1, component: PickName },
    { id: 2, component: Lobby },
  ];
  const CurrentStepComponent = steps[currentStep - 1].component;
  const nextStep = () => {
    setCurrentStep((prevStep) => prevStep + 1);
    window.scrollTo(0, 0);
  };
  return (
    <ThemeContext.Provider value={{ isDarkMode }}>
      <div className={`App ${isDarkMode ? 'dark-mode' : ''}`}>
        <CurrentStepComponent curUser={curUser} setCurUser={setCurUser} nextStep={nextStep}/>
      </div>
    </ThemeContext.Provider>
  );
};