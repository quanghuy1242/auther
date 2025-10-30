"use client";

import * as React from "react";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Icon,
  Input,
  Textarea,
  Label,
  Select,
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  Tabs,
  Dropdown,
} from "@/components/ui";
import { Alert } from "@/components/layout/alert";

export default function ComponentShowcase() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedRole, setSelectedRole] = React.useState("editor");
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [showAlert, setShowAlert] = React.useState(true);
  const [formData, setFormData] = React.useState({
    username: "",
    email: "",
    bio: "",
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", { ...formData, role: selectedRole, notifications: isEnabled });
    alert("Form submitted! Check console for data.");
  };

  return (
    <div className="min-h-screen bg-[#111921] p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">UI Component Showcase</h1>
          <p className="text-gray-400">Better Auth Admin Component Library - Complete Reference</p>
        </div>

        {/* Alert */}
        {showAlert && (
          <Alert
            variant="info"
            title="Welcome to the Component Library"
            onClose={() => setShowAlert(false)}
          >
            This page showcases all available UI components with interactive examples.
          </Alert>
        )}

        {/* Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="mb-2">Variants</Label>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" leftIcon="add">
                    Primary
                  </Button>
                  <Button variant="secondary" leftIcon="edit">
                    Secondary
                  </Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger" leftIcon="delete">
                    Danger
                  </Button>
                  <Button variant="success" leftIcon="check">
                    Success
                  </Button>
                </div>
              </div>
              <div>
                <Label className="mb-2">States</Label>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" disabled>
                    Disabled
                  </Button>
                  <Button variant="primary" isLoading>
                    Loading...
                  </Button>
                  <Button variant="secondary" rightIcon="arrow_forward">
                    With Right Icon
                  </Button>
                </div>
              </div>
              <div>
                <Label className="mb-2">Sizes</Label>
                <div className="flex flex-wrap gap-3 items-center">
                  <Button variant="primary" size="sm">
                    Small
                  </Button>
                  <Button variant="primary" size="md">
                    Medium (Default)
                  </Button>
                  <Button variant="primary" size="lg">
                    Large
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="mb-2">Status Badges</Label>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="success" dot>
                    Active
                  </Badge>
                  <Badge variant="warning" dot>
                    Pending
                  </Badge>
                  <Badge variant="danger" dot>
                    Inactive
                  </Badge>
                  <Badge variant="info" dot>
                    Verified
                  </Badge>
                  <Badge variant="default">Default</Badge>
                </div>
              </div>
              <div>
                <Label className="mb-2">Without Dots</Label>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="danger">Danger</Badge>
                  <Badge variant="info">Info</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Form Inputs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-w-md">
              <div>
                <Label htmlFor="input-basic">Basic Input</Label>
                <Input
                  id="input-basic"
                  placeholder="Enter text..."
                />
              </div>
              <div>
                <Label htmlFor="input-icon">Input with Icons</Label>
                <Input
                  id="input-icon"
                  placeholder="Search..."
                  leftIcon="search"
                  rightIcon="close"
                />
              </div>
              <div>
                <Label htmlFor="input-error">Input with Error</Label>
                <Input
                  id="input-error"
                  placeholder="Invalid input"
                  error="This field is required"
                />
              </div>
              <div>
                <Label htmlFor="input-disabled">Disabled Input</Label>
                <Input
                  id="input-disabled"
                  placeholder="Disabled"
                  disabled
                  value="Can't edit this"
                />
              </div>
              <div>
                <Label htmlFor="textarea-demo">Textarea</Label>
                <Textarea
                  id="textarea-demo"
                  placeholder="Enter longer text..."
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Select & Checkbox */}
        <Card>
          <CardHeader>
            <CardTitle>Select & Checkbox</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-w-md">
              <div>
                <Label>Select Dropdown</Label>
                <Select
                  value={selectedRole}
                  onChange={setSelectedRole}
                  options={[
                    { value: "admin", label: "Administrator" },
                    { value: "editor", label: "Editor" },
                    { value: "viewer", label: "Viewer" },
                  ]}
                  placeholder="Choose a role..."
                />
              </div>
              <div>
                <Checkbox
                  checked={isEnabled}
                  onChange={setIsEnabled}
                  label="Enable notifications"
                  description="Receive email notifications for important updates"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dropdown Menu */}
        <Card>
          <CardHeader>
            <CardTitle>Dropdown Menu</CardTitle>
          </CardHeader>
          <CardContent>
            <Dropdown
              trigger={
                <Button variant="secondary" rightIcon="arrow_drop_down">
                  Actions Menu
                </Button>
              }
              items={[
                { label: "Edit Profile", icon: "edit", onClick: () => alert("Edit clicked") },
                { label: "View Details", icon: "visibility", href: "#" },
                { separator: true },
                { label: "Settings", icon: "settings", onClick: () => alert("Settings clicked") },
                { label: "Help & Support", icon: "help" },
                { separator: true },
                { label: "Sign Out", icon: "logout", danger: true, onClick: () => alert("Sign out clicked") },
              ]}
            />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Data Table</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "John Doe", email: "john@example.com", role: "Admin", status: "active" },
                  { name: "Jane Smith", email: "jane@example.com", role: "Editor", status: "active" },
                  { name: "Bob Wilson", email: "bob@example.com", role: "Viewer", status: "inactive" },
                ].map((user, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <p className="font-medium text-white">{user.name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-gray-400">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === "active" ? "success" : "default"} dot>
                        {user.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal */}
        <Card>
          <CardHeader>
            <CardTitle>Modal Dialog</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="primary" onClick={() => setIsModalOpen(true)} leftIcon="open_in_new">
              Open Modal
            </Button>
            <Modal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              title="Example Modal"
              description="This is a modal dialog with actions"
            >
              <div className="space-y-4">
                <p className="text-gray-300">
                  Modal content goes here. You can place any React components inside the modal body.
                </p>
                <div className="flex gap-3 justify-end">
                  <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      alert("Confirmed!");
                      setIsModalOpen(false);
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </Modal>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Tabs Navigation</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              tabs={[
                {
                  label: "Overview",
                  content: (
                    <div className="py-4">
                      <h3 className="text-lg font-semibold text-white mb-2">Overview Tab</h3>
                      <p className="text-gray-400">
                        This is the overview content. Tabs provide an accessible way to organize content.
                      </p>
                    </div>
                  ),
                },
                {
                  label: "Details",
                  content: (
                    <div className="py-4">
                      <h3 className="text-lg font-semibold text-white mb-2">Details Tab</h3>
                      <p className="text-gray-400">
                        Detailed information goes here with full keyboard navigation support.
                      </p>
                    </div>
                  ),
                },
                {
                  label: "Settings",
                  content: (
                    <div className="py-4">
                      <h3 className="text-lg font-semibold text-white mb-2">Settings Tab</h3>
                      <p className="text-gray-400">Configuration options and preferences.</p>
                    </div>
                  ),
                },
                {
                  label: "Disabled",
                  content: <div>This tab is disabled</div>,
                  disabled: true,
                },
              ]}
            />
          </CardContent>
        </Card>

        {/* Complete Form Example */}
        <Card>
          <CardHeader>
            <CardTitle>Complete Form Example</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFormSubmit} className="space-y-4 max-w-md">
              <div>
                <Label htmlFor="form-username">Username</Label>
                <Input
                  id="form-username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter username"
                  leftIcon="person"
                />
              </div>

              <div>
                <Label htmlFor="form-email">Email Address</Label>
                <Input
                  id="form-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  leftIcon="email"
                />
              </div>

              <div>
                <Label>User Role</Label>
                <Select
                  value={selectedRole}
                  onChange={setSelectedRole}
                  options={[
                    { value: "admin", label: "Administrator" },
                    { value: "editor", label: "Editor" },
                    { value: "viewer", label: "Viewer" },
                  ]}
                />
              </div>

              <div>
                <Label htmlFor="form-bio">Bio (Optional)</Label>
                <Textarea
                  id="form-bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
              </div>

              <Checkbox
                checked={isEnabled}
                onChange={setIsEnabled}
                label="Enable email notifications"
                description="You'll receive updates about your account"
              />

              <Button type="submit" variant="primary">
                Submit Form
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Icons */}
        <Card>
          <CardHeader>
            <CardTitle>Material Symbols Icons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 items-center">
              <div className="flex flex-col items-center gap-2">
                <Icon name="person" size="lg" className="text-[#1773cf]" />
                <span className="text-xs text-gray-400">person</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Icon name="settings" size="lg" className="text-[#1773cf]" />
                <span className="text-xs text-gray-400">settings</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Icon name="lock" size="lg" className="text-[#1773cf]" filled />
                <span className="text-xs text-gray-400">lock (filled)</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Icon name="key" size="lg" className="text-[#1773cf]" />
                <span className="text-xs text-gray-400">key</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Icon name="group" size="lg" className="text-[#1773cf]" />
                <span className="text-xs text-gray-400">group</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Icon name="dashboard" size="lg" className="text-green-500" />
                <span className="text-xs text-gray-400">dashboard</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Icon name="notifications" size="lg" className="text-yellow-500" />
                <span className="text-xs text-gray-400">notifications</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Icon name="logout" size="lg" className="text-red-500" />
                <span className="text-xs text-gray-400">logout</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stat Cards */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">Stat Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card variant="bordered">
              <CardContent>
                <div className="flex items-center gap-3">
                  <Icon name="person" size="xl" className="text-[#1773cf]" />
                  <div>
                    <p className="text-2xl font-bold text-white">1,234</p>
                    <p className="text-sm text-gray-400">Total Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card variant="bordered">
              <CardContent>
                <div className="flex items-center gap-3">
                  <Icon name="apps" size="xl" className="text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">56</p>
                    <p className="text-sm text-gray-400">OAuth Clients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card variant="bordered">
              <CardContent>
                <div className="flex items-center gap-3">
                  <Icon name="schedule" size="xl" className="text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">892</p>
                    <p className="text-sm text-gray-400">Active Sessions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardContent>
            <p className="text-sm text-gray-400 text-center">
              ✨ Complete component library with form validation, accessibility, and dark mode support
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
