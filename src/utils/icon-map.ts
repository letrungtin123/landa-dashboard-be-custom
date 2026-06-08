import {
  LayoutDashboard, Users, UsersRound, Building2, Settings2, Activity, Bot,
  ShieldCheck, FileText, FileSpreadsheet, MessageSquare, MessageCircle, Bell, BarChart3,
  Mail, Globe, Lock, Key, Database,
  Palette, Image, Video, Music, BookOpen,
  Calendar, Clock, Star, Heart, Zap,
  Blocks, Box, Briefcase, CreditCard, ShoppingCart,
  Headphones, Monitor, Smartphone, Wifi, Cloud,
  Code, Terminal, GitBranch, Package, Puzzle, Layers,
  Home, Search, Menu, Filter, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Check, X,
  Plus, Minus, RefreshCw, Trash2, Edit, Save, Upload, Download, Eye, EyeOff,
  Link, ExternalLink, Paperclip, MapPin, Compass, Navigation, Camera, Aperture, Film, Play,
  Pause, Square, Circle, Triangle, Hexagon, Octagon, Hash, AtSign, Percent, DollarSign,
  Euro, PoundSterling, Bitcoin, Flag, Bookmark, Tag, Folder, FolderOpen, File, FilePlus,
  FileMinus, Keyboard, Mouse, Laptop, Server, HardDrive, Cpu, Battery,
  BatteryCharging, BatteryFull, BatteryLow, Bluetooth, Shield, ShieldAlert, AlertCircle, AlertTriangle, Info, HelpCircle,
  ThumbsUp, ThumbsDown, Smile, Frown, Meh, Sun, Moon, CloudRain, CloudLightning, Wind,
  Droplet, Flame, Snowflake, Thermometer, Anchor, LifeBuoy, Target, Crosshair, Map, Navigation2,
  Share, Share2, CornerUpLeft, CornerUpRight, Move, Maximize, Minimize, ZoomIn, ZoomOut, Maximize2,
  Minimize2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUp, ChevronsDown, ChevronsLeft, ChevronsRight, List,
  ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Type, Underline, Bold, Italic, Strikethrough,
  Scissors, Copy, Clipboard, Archive, Inbox, Phone, PhoneCall, PhoneForwarded, PhoneMissed, PhoneOff,
  Mic, MicOff, Volume, Volume1, Volume2, VolumeX, Radio, Tv, Cast, Airplay,
  Contact, ScrollText, Library, GraduationCap, FolderTree, FolderKanban, Drama,
  type LucideIcon,
} from 'lucide-react';

/**
 * Map of icon name strings (stored in DB) to Lucide icon components.
 * Used by both the sidebar and the Settings icon picker.
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Users, UsersRound, Building2, Settings2, Activity, Bot,
  ShieldCheck, FileText, FileSpreadsheet, MessageSquare, MessageCircle, Bell, BarChart3,
  Mail, Globe, Lock, Key, Database,
  Palette, Image, Video, Music, BookOpen,
  Calendar, Clock, Star, Heart, Zap,
  Blocks, Box, Briefcase, CreditCard, ShoppingCart,
  Headphones, Monitor, Smartphone, Wifi, Cloud,
  Code, Terminal, GitBranch, Package, Puzzle, Layers,
  Home, Search, Menu, Filter, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Check, X,
  Plus, Minus, RefreshCw, Trash2, Edit, Save, Upload, Download, Eye, EyeOff,
  Link, ExternalLink, Paperclip, MapPin, Compass, Navigation, Camera, Aperture, Film, Play,
  Pause, Square, Circle, Triangle, Hexagon, Octagon, Hash, AtSign, Percent, DollarSign,
  Euro, PoundSterling, Bitcoin, Flag, Bookmark, Tag, Folder, FolderOpen, File, FilePlus,
  FileMinus, Keyboard, Mouse, Laptop, Server, HardDrive, Cpu, Battery,
  BatteryCharging, BatteryFull, BatteryLow, Bluetooth, Shield, ShieldAlert, AlertCircle, AlertTriangle, Info, HelpCircle,
  ThumbsUp, ThumbsDown, Smile, Frown, Meh, Sun, Moon, CloudRain, CloudLightning, Wind,
  Droplet, Flame, Snowflake, Thermometer, Anchor, LifeBuoy, Target, Crosshair, Map, Navigation2,
  Share, Share2, CornerUpLeft, CornerUpRight, Move, Maximize, Minimize, ZoomIn, ZoomOut, Maximize2,
  Minimize2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUp, ChevronsDown, ChevronsLeft, ChevronsRight, List,
  ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Type, Underline, Bold, Italic, Strikethrough,
  Scissors, Copy, Clipboard, Archive, Inbox, Phone, PhoneCall, PhoneForwarded, PhoneMissed, PhoneOff,
  Mic, MicOff, Volume, Volume1, Volume2, VolumeX, Radio, Tv, Cast, Airplay,
  Contact, ScrollText, Library, GraduationCap, FolderTree, FolderKanban, Drama,
};

export const ICON_LIST = Object.keys(ICON_MAP);

/**
 * Get a Lucide icon component from its name string.
 * Falls back to Blocks if not found.
 */
export function getIconComponent(iconName: string | null | undefined): LucideIcon {
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
  return Blocks;
}
