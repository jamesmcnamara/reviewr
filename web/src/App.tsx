import React, { useState, useEffect } from 'react';
import './App.css';
import { TagList } from './components/TagList';
import { DiffViewer } from './components/DiffViewer';
import { Diff, TaggedDiffs } from './types';

function App() {
  const [taggedDiffs, setTaggedDiffs] = useState<TaggedDiffs>({});
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In a real app, this would fetch from an API
    // For now, we'll load the JSON file directly
    fetch('/diffs_for_query_params.json')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load diffs data');
        }
        return response.json();
      })
      .then(data => {
        console.log(data)
        setTaggedDiffs(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);
  };

  if (loading) {
    return <div className="app-container">Loading...</div>;
  }

  if (error) {
    return <div className="app-container error-message">Error: {error}</div>;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Diff Viewer</h1>
      </header>
      <main className="app-main">
        <TagList 
          tags={Object.keys(taggedDiffs)} 
          selectedTag={selectedTag} 
          onSelectTag={handleTagSelect} 
        />
        {selectedTag && (
          <DiffViewer 
            diffs={taggedDiffs[selectedTag] || []} 
            tag={selectedTag} 
          />
        )}
        {!selectedTag && (
          <div className="select-tag-prompt">
            Select a tag to view related diffs
          </div>
        )}
      </main>
    </div>
  );
}

export default App;