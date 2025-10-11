import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// Generic Option Management Component
const ManageDropdownOptions: React.FC = () => {
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [skillLevels, setSkillLevels] = useState<string[]>([]);
  const [newType, setNewType] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newSkill, setNewSkill] = useState("");

  // Fetch on mount
  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    let { data: types } = await supabase.from("event_types").select("name");
    let { data: ages } = await supabase.from("age_groups").select("name");
    let { data: skills } = await supabase.from("skill_levels").select("name");
    setEventTypes(types?.map(t => t.name) || []);
    setAgeGroups(ages?.map(a => a.name) || []);
    setSkillLevels(skills?.map(s => s.name) || []);
  };

  const addOption = async (table: string, name: string, cb: () => void) => {
    if (!name.trim()) return;
    await supabase.from(table).insert([{ name }]);
    cb();
    fetchOptions();
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">Manage Event Dropdown Options</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {/* Event Types */}
        <div>
          <div className="font-semibold mb-1">Event Types</div>
          <ul className="mb-2">{eventTypes.map(t => <li key={t}>{t}</li>)}</ul>
          <input
            type="text"
            value={newType}
            onChange={e => setNewType(e.target.value)}
            placeholder="Add event type"
            className="border p-1 rounded mr-2"
          />
          <button
            className="bg-blue-500 text-white px-2 rounded"
            onClick={() => addOption("event_types", newType, () => setNewType(""))}
          >Add</button>
        </div>
        {/* Age Groups */}
        <div>
          <div className="font-semibold mb-1">Age Groups</div>
          <ul className="mb-2">{ageGroups.map(a => <li key={a}>{a}</li>)}</ul>
          <input
            type="text"
            value={newAge}
            onChange={e => setNewAge(e.target.value)}
            placeholder="Add age group"
            className="border p-1 rounded mr-2"
          />
          <button
            className="bg-blue-500 text-white px-2 rounded"
            onClick={() => addOption("age_groups", newAge, () => setNewAge(""))}
          >Add</button>
        </div>
        {/* Skill Levels */}
        <div>
          <div className="font-semibold mb-1">Skill Levels</div>
          <ul className="mb-2">{skillLevels.map(s => <li key={s}>{s}</li>)}</ul>
          <input
            type="text"
            value={newSkill}
            onChange={e => setNewSkill(e.target.value)}
            placeholder="Add skill level"
            className="border p-1 rounded mr-2"
          />
          <button
            className="bg-blue-500 text-white px-2 rounded"
            onClick={() => addOption("skill_levels", newSkill, () => setNewSkill(""))}
          >Add</button>
        </div>
      </div>
    </div>
  );
};

export default ManageDropdownOptions;
