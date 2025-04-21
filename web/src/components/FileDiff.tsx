import React, { useState } from 'react';
import { Diff } from '../types';
import './FileDiff.css';

interface FileDiffProps {
  diff: Diff;
}

export const FileDiff: React.FC<FileDiffProps> = ({ diff }) => {
  const [expanded, setExpanded] = useState(true);
  
  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  // Function to render syntax highlighted code from patch
  const renderDiffContent = () => {
    if (!diff.patch) return <div className="empty-diff">No diff content available</div>;
    
    // Split the patch into lines
    const lines = diff.patch.split('\n');
    
    return (
      <pre className="diff-content">
        <code>
          {lines.map((line, index) => {
            let lineClass = '';
            if (line.startsWith('+')) lineClass = 'addition';
            else if (line.startsWith('-')) lineClass = 'deletion';
            else if (line.startsWith('@')) lineClass = 'hunk-header';
            
            return (
              <div key={index} className={`diff-line ${lineClass}`}>
                <span className="line-number">{index + 1}</span>
                <span className="line-content">{line}</span>
              </div>
            );
          })}
        </code>
      </pre>
    );
  };

  return (
    <div>
      <div className="diff-summary">{diff.summary}</div>
      <div className="file-diff-container">
      <div className="file-header" onClick={toggleExpand}>
        <div className="file-info">
          <span className="filename">{diff.filename}</span>
          <div className="file-meta">
            <span className="priority-badge" data-priority={diff.priority}>
              {diff.priority}
            </span>
            {diff.tags.map(tag => (
              <span key={tag} className="tag-badge">{tag}</span>
            ))}
          </div>
        </div>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>
      
      {expanded && (
        <div className="diff-body">
          {renderDiffContent()}
        </div>
      )}
      </div>
    </div>
  );
};