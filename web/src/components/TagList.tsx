import React from 'react';
import './TagList.css';

interface TagListProps {
  tags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string) => void;
}

export const TagList: React.FC<TagListProps> = ({ tags, selectedTag, onSelectTag }) => {
  return (
    <div className="tag-list-container">
      <h2>Tags</h2>
      <ul className="tag-list">
        {tags.map(tag => (
          <li 
            key={tag}
            className={`tag-item ${selectedTag === tag ? 'selected' : ''}`}
            onClick={() => onSelectTag(tag)}
          >
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
};