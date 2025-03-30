import React from 'react';
import PropTypes from 'prop-types';

const TabBar = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'config', label: 'Start' },
    { id: 'source', label: 'Select Files' },
    { id: 'processed', label: 'Processed Output' },
  ];

  return (
    <div className='flex flex-grow'>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`px-6 py-2 font-medium transition-colors ${
            activeTab === tab.id ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-200'
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

TabBar.propTypes = {
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
};

export default TabBar;
