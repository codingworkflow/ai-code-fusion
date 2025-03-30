import React from 'react';
import PropTypes from 'prop-types';

const TabBar = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'config', label: 'Start' },
    { id: 'source', label: 'Select Files' },
    { id: 'processed', label: 'Processed Output' },
  ];

  return (
    <div className='mb-4 flex border-b border-gray-300'>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`px-4 py-2 ${
            activeTab === tab.id
              ? 'rounded-t-lg border-x border-t border-gray-300 bg-white text-blue-600'
              : 'bg-gray-200 text-gray-700'
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
