import React from 'react';
import type { TabId } from '../../types/ipc';

type TabBarProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

const TabBar = ({ activeTab, onTabChange }: TabBarProps) => {
  const tabs = [
    { id: 'config', label: 'Start' },
    { id: 'source', label: 'Select Files' },
    { id: 'processed', label: 'Processed Output' },
  ] as const;

  return (
    <div className='flex flex-grow' role='tablist'>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role='tab'
          id={`tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          className={`px-6 py-2 font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-gray-800 dark:bg-gray-700 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          onClick={() => onTabChange(tab.id)}
          data-tab={tab.id}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default TabBar;
