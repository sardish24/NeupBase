'use client';
import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, MessageCircle, BookOpen } from 'lucide-react';
// TypeScript interfaces mirroring the SQL query output
export interface CourseNode {
  node_id: string;
  parent_id: string | null;
  level: number;
  label: string;
  resource_hint?: string | null;
  isToday?: boolean; // Derived boolean based on external scheduling state
  children: CourseNode[];
}
interface TreeProps {
  flatData: any[]; // Raw flat array directly from the SQL CTE response
}
/**
 * Utility function to parse the flat SQL CTE result into a nested graph.
 * Achieves O(n) Time Complexity using a high-speed Hash Map memory lookup.
 */
function buildTreeFromFlatList(flatNodes: any[]): CourseNode[] {
  const map = new Map<string, CourseNode>();
  const roots: CourseNode[] = [];
  // First pass: Initialize all node objects with empty children arrays
  flatNodes.forEach(node => {
    map.set(node.node_id, { ...node, children: [] });
  });
  // Second pass: Wire relational references using the Hash Map
  flatNodes.forEach(node => {
    const currentNode = map.get(node.node_id)!;
    if (node.parent_id === null) {
      roots.push(currentNode);
    } else {
      const parent = map.get(node.parent_id);
      if (parent) {
        parent.children.push(currentNode);
      }
    }
  });
  return roots;
}
/**
 * Recursive Tree Node Component.
 * Encapsulates internal collapse/expand state to eliminate global re-renders.
 */
const TreeNodeComponent: React.FC<{ node: CourseNode }> = ({ node }) => {
  // Default expanding top-level modules (Level 1) to provide immediate context
  const [isExpanded, setIsExpanded] = useState(node.level === 1);
  const hasChildren = node.children && node.children.length > 0;
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) setIsExpanded(!isExpanded);
  };
  // Determine structural highlight logic for scheduled nodes
  const bgClass = node.isToday 
    ? 'bg-blue-50 border-l-4 border-blue-500' 
    : 'hover:bg-gray-50 border-l-4 border-transparent';
  // Apply dynamic sizing logic directly to typography based on hierarchical depth
  const textClass = node.level === 1 
    ? 'text-base font-semibold text-gray-900' 
    : 'text-sm font-medium text-gray-700';
  return (
    <div className="w-full select-none">
      <div 
        // Inline style maps exact indentation based on node depth level
        style={{ paddingLeft: `${(node.level - 1) * 1.5}rem` }}
        className={`flex items-center py-2 pr-3 cursor-pointer transition-colors duration-150 ${bgClass}`}
        onClick={handleToggle}
      >
        {/* Toggle Icon Container */}
        <div className="w-6 flex justify-center mr-1 shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500 hover:text-gray-900" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500 hover:text-gray-900" />
            )
          ) : (
            <span className="w-4 h-4" /> // Empty spacer aligns leaf nodes flawlessly
          )}
        </div>
        {/* Label and Resource Hint Container */}
        <div className="flex-1 flex flex-col justify-center">
          <span className={textClass}>
            {node.label}
          </span>
          {node.resource_hint && (
            <span className="text-xs text-gray-500 mt-0.5 flex items-center">
              <BookOpen className="w-3 h-3 mr-1" />
              {node.resource_hint}
            </span>
          )}
        </div>
        {/* Level-specific Interactive Feature Rendering */}
        {node.level === 3 && (
          <button 
            className="ml-2 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-all"
            title="Chat with AI Tutor regarding this Subtopic"
            onClick={(e) => {
              e.stopPropagation();
              // Hook into application chat pipeline utilizing node.node_id
              console.log('Initiate tutor context for node:', node.node_id);
            }}
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        )}
      </div>
      {/* Recursive Traversal Call Execution */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col w-full animate-in slide-in-from-top-1 fade-in duration-200">
          {node.children.map((child) => (
            <TreeNodeComponent key={child.node_id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};
/**
 * Root Tree Explorer Interface
 * Manages data transformation and provides the structural wrapper.
 */
export const CourseKnowledgeExplorer: React.FC<TreeProps> = ({ flatData }) => {
  // Memoize the O(n) graph generation to prevent recalculation on generic re-renders
  const nestedTree = useMemo(() => buildTreeFromFlatList(flatData), [flatData]);
  if (!nestedTree || nestedTree.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
        <BookOpen className="w-8 h-8 mx-auto mb-3 text-gray-400" />
        <p>No course knowledge tree available.</p>
        <p className="text-sm mt-1">Upload a syllabus handout to automatically generate the architecture.</p>
      </div>
    );
  }
  return (
    <div className="w-full max-w-3xl mx-auto border border-gray-200 rounded-xl shadow-sm bg-white overflow-hidden">
      <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
          Curriculum Explorer
        </h3>
      </div>
      {/* Scrollable container with optimized performance classes */}
      <div className="flex flex-col py-2 max-h-[75vh] overflow-y-auto overscroll-contain">
        {nestedTree.map((rootNode) => (
          <TreeNodeComponent key={rootNode.node_id} node={rootNode} />
        ))}
      </div>
    </div>
  );
};
