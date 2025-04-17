import React from 'react';
import { Diff } from '../types';
import { FileDiff } from './FileDiff';
import './DiffViewer.css';

interface DiffViewerProps {
  diffs: Diff[];
  tag: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diffs, tag }) => {
  if (diffs.length === 0) {
    return <div className="diff-viewer-empty">No diffs found for tag: {tag}</div>;
  }

  return (
    <div className="diff-viewer-container">
      <h2 className="diff-viewer-header">{tag} Changes</h2>
      <div className="diff-count">{diffs.length} files changed</div>
      
      <div className="file-diffs-container">
        {diffs.map(diff => (
          <FileDiff key={diff.id} diff={diff} />
        ))}
      </div>
    </div>
  );
};