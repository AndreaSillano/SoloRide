import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  SCHEDULE_KIND_OPTIONS,
  WEEKDAY_ORDINAL_OPTIONS,
  type RideFormValues,
  type ScheduleKind,
} from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

import { NativeSwitch, GlassSurface } from './glass';
import { Body, Field, WeekdaySelector } from './ui';

type PickerField = 'startDate' | 'endDate' | 'notificationTime';

function dateFromValue(value: string, mode: 'date' | 'time') {
  if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    if (year && month && day) return new Date(year, month - 1, day, 12);
  }
  if (mode === 'time' && /^\d{2}:\d{2}/.test(value)) {
    const [hours, minutes] = value.split(':').map(Number);
    const date = new Date();
    date.setHours(hours ?? 9, minutes ?? 0, 0, 0);
    return date;
  }
  return new Date();
}

function toDateValue(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Choose date';
  return dateFromValue(value, 'date').toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function topLevelKind(kind: ScheduleKind): 'weekly' | 'biweekly' | 'monthly' {
  if (kind === 'biweekly') return 'biweekly';
  if (kind === 'monthly_date' || kind === 'monthly_weekday') return 'monthly';
  return 'weekly';
}

export function RideForm({
  value,
  onChange,
  disabled = false,
}: {
  value: RideFormValues;
  onChange: (value: RideFormValues) => void;
  disabled?: boolean;
}) {
  const [picker, setPicker] = useState<PickerField | null>(null);

  const set = <Key extends keyof RideFormValues>(
    key: Key,
    nextValue: RideFormValues[Key],
  ) => onChange({ ...value, [key]: nextValue });

  const setKind = (scheduleKind: ScheduleKind) => {
    haptics.selection();
    const todayWeekday = new Date().getDay();
    const next: RideFormValues = {
      ...value,
      scheduleKind,
      strictSchedule: scheduleKind === 'weekly' ? value.strictSchedule : true,
    };
    if (scheduleKind === 'monthly_date') {
      next.weekdays = [];
      if (!next.monthDay) next.monthDay = new Date().getDate();
    } else if (scheduleKind === 'monthly_weekday') {
      next.weekdays = value.weekdays.length === 1 ? value.weekdays : [todayWeekday];
      if (![1, 2, 3, 4, -1].includes(next.weekdayOrdinal)) next.weekdayOrdinal = 1;
    } else if (value.weekdays.length === 0) {
      next.weekdays = [todayWeekday];
    }
    onChange(next);
  };

  const pickerMode = picker === 'notificationTime' ? 'time' : 'date';
  const pickerValue = picker ? dateFromValue(value[picker], pickerMode) : new Date();
  const datePickerOpen = picker === 'startDate' || picker === 'endDate';
  const timePickerOpen = picker === 'notificationTime';
  const rhythm = topLevelKind(value.scheduleKind);
  const showWeekdays =
    value.scheduleKind === 'weekly' ||
    value.scheduleKind === 'biweekly' ||
    value.scheduleKind === 'monthly_weekday';

  const togglePicker = (field: PickerField) =>
    setPicker((current) => (current === field ? null : field));

  const handlePickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setPicker(null);
    if (event.type === 'dismissed' || !date || !picker) return;
    set(picker, picker === 'notificationTime' ? toTimeValue(date) : toDateValue(date));
  };

  const pickerPanel =
    picker ? (
      <GlassSurface style={styles.picker}>
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          mode={pickerMode}
          onChange={handlePickerChange}
          value={pickerValue}
        />
        {Platform.OS === 'ios' ? (
          <Pressable onPress={() => setPicker(null)} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        ) : null}
      </GlassSurface>
    ) : null;

  return (
    <View style={styles.form}>
      <View style={styles.countedField}>
        <Field
          autoCapitalize="sentences"
          editable={!disabled}
          label="Ride name"
          maxLength={20}
          onChangeText={(text) => set('name', text)}
          placeholder="Morning miles"
          value={value.name}
        />
        <Text style={styles.charCount}>{value.name.length}/20</Text>
      </View>
      <View style={styles.countedField}>
        <Field
          autoCapitalize="sentences"
          editable={!disabled}
          label="Description (optional)"
          maxLength={30}
          multiline
          onChangeText={(text) => set('description', text)}
          placeholder="What are you riding toward?"
          style={styles.description}
          value={value.description}
        />
        <Text style={styles.charCount}>{value.description.length}/30</Text>
      </View>
      <View style={styles.dateRow}>
        <PickerButton
          active={picker === 'startDate'}
          disabled={disabled}
          label="Starts"
          onPress={() => togglePicker('startDate')}
          value={formatDateLabel(value.startDate)}
        />
        <PickerButton
          active={picker === 'endDate'}
          disabled={disabled || value.neverEnds}
          label="Ends"
          onPress={() => togglePicker('endDate')}
          value={value.neverEnds ? 'Never' : formatDateLabel(value.endDate)}
        />
      </View>
      {datePickerOpen && !value.neverEnds ? pickerPanel : null}
      <View style={styles.scheduleMode}>
        <View style={styles.scheduleModeText}>
          <Text style={styles.label}>Never ends</Text>
          <Body muted>Keep the Ride open with no end date.</Body>
        </View>
        <NativeSwitch
          disabled={disabled}
          onValueChange={(neverEnds) => {
            haptics.selection();
            set('neverEnds', neverEnds);
            if (neverEnds && picker === 'endDate') setPicker(null);
          }}
          value={value.neverEnds}
        />
      </View>

      <View style={styles.scheduleMode}>
        <View style={styles.scheduleModeText}>
          <Text style={styles.label}>Challenges</Text>
          <Body muted>
            {value.challengesEnabled
              ? 'Fun photo prompts open automatically for the group.'
              : 'Challenge prompts stay off for this Ride.'}
          </Body>
        </View>
        <NativeSwitch
          disabled={disabled}
          onValueChange={(challengesEnabled) => {
            haptics.selection();
            set('challengesEnabled', challengesEnabled);
          }}
          value={value.challengesEnabled}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Posting rhythm</Text>
        <View style={styles.rhythmRow}>
          {SCHEDULE_KIND_OPTIONS.map((option) => {
            const selected =
              option.value === 'monthly_date'
                ? rhythm === 'monthly'
                : value.scheduleKind === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  if (option.value === 'monthly_date') {
                    setKind(
                      value.scheduleKind === 'monthly_weekday'
                        ? 'monthly_weekday'
                        : 'monthly_date',
                    );
                    return;
                  }
                  setKind(option.value);
                }}
                style={({ pressed }) => [
                  styles.rhythmPill,
                  selected && styles.rhythmPillSelected,
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <Text
                  style={[
                    styles.rhythmPillText,
                    selected && styles.rhythmPillTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {rhythm === 'monthly' ? (
          <View style={styles.rhythmRow}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{
                checked: value.scheduleKind === 'monthly_date',
                disabled,
              }}
              disabled={disabled}
              onPress={() => setKind('monthly_date')}
              style={({ pressed }) => [
                styles.rhythmPill,
                value.scheduleKind === 'monthly_date' && styles.rhythmPillSelected,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.rhythmPillText,
                  value.scheduleKind === 'monthly_date' && styles.rhythmPillTextSelected,
                ]}
              >
                Day of month
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{
                checked: value.scheduleKind === 'monthly_weekday',
                disabled,
              }}
              disabled={disabled}
              onPress={() => setKind('monthly_weekday')}
              style={({ pressed }) => [
                styles.rhythmPill,
                value.scheduleKind === 'monthly_weekday' && styles.rhythmPillSelected,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.rhythmPillText,
                  value.scheduleKind === 'monthly_weekday' &&
                    styles.rhythmPillTextSelected,
                ]}
              >
                Weekday of month
              </Text>
            </Pressable>
          </View>
        ) : null}

        {value.scheduleKind === 'monthly_date' ? (
          <View style={styles.monthDayRow}>
            <Text style={styles.monthDayLabel}>On day</Text>
            <GlassSurface style={styles.monthDayInputGlass}>
              <TextInput
                editable={!disabled}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(text) => {
                  const digits = text.replace(/\D/g, '');
                  if (!digits) {
                    set('monthDay', 1);
                    return;
                  }
                  const next = Math.min(31, Math.max(1, Number(digits)));
                  set('monthDay', next);
                }}
                style={styles.monthDayInput}
                value={String(value.monthDay || 1)}
              />
            </GlassSurface>
            <Body muted>Short months use the last day.</Body>
          </View>
        ) : null}

        {value.scheduleKind === 'monthly_weekday' ? (
          <View style={styles.ordinalRow}>
            {WEEKDAY_ORDINAL_OPTIONS.map((option) => {
              const selected = value.weekdayOrdinal === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    haptics.selection();
                    set('weekdayOrdinal', option.value);
                  }}
                  style={({ pressed }) => [
                    styles.ordinalPill,
                    selected && styles.rhythmPillSelected,
                    pressed && styles.pressed,
                    disabled && styles.disabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.rhythmPillText,
                      selected && styles.rhythmPillTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {showWeekdays ? (
          <>
            <Text style={styles.subLabel}>
              {value.scheduleKind === 'monthly_weekday'
                ? 'Weekday'
                : value.scheduleKind === 'biweekly'
                  ? 'Weekdays (every other week)'
                  : 'Weekdays'}
            </Text>
            <WeekdaySelector
              disabled={disabled}
              onChange={(weekdays) => set('weekdays', weekdays)}
              single={value.scheduleKind === 'monthly_weekday'}
              value={value.weekdays}
            />
          </>
        ) : null}

        {value.scheduleKind === 'weekly' ? (
          <View style={styles.scheduleMode}>
            <View style={styles.scheduleModeText}>
              <Text style={styles.label}>Strict schedule</Text>
              <Body muted>
                {value.strictSchedule
                  ? 'Members must post on every selected day.'
                  : 'Members can post on any one selected day each week.'}
              </Body>
            </View>
            <NativeSwitch
              disabled={disabled}
              onValueChange={(strictSchedule) => {
                haptics.selection();
                set('strictSchedule', strictSchedule);
              }}
              value={value.strictSchedule}
            />
          </View>
        ) : value.scheduleKind === 'biweekly' ? (
          <Body muted>Posts are due on the selected days every other week, from the start week.</Body>
        ) : null}
      </View>

      <PickerButton
        active={timePickerOpen}
        disabled={disabled}
        label="Notification time"
        onPress={() => togglePicker('notificationTime')}
        value={value.notificationTime}
      />
      {timePickerOpen ? pickerPanel : null}
    </View>
  );
}

function PickerButton({
  label,
  value,
  onPress,
  disabled,
  active = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled: boolean;
  active?: boolean;
}) {
  return (
    <View style={styles.pickerButtonWrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}
      >
        <GlassSurface
          style={[styles.pickerButton, active && styles.pickerButtonActive]}
        >
          <Text style={styles.pickerButtonText}>{value}</Text>
        </GlassSurface>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  group: { gap: spacing.sm },
  scheduleMode: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  scheduleModeText: { flex: 1, gap: spacing.xxs },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  subLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  description: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: 'top' },
  countedField: { gap: spacing.xs },
  charCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  rhythmRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rhythmPill: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  rhythmPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rhythmPillText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  rhythmPillTextSelected: { color: colors.white },
  ordinalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  ordinalPill: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  monthDayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  monthDayLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  monthDayInput: {
    backgroundColor: 'transparent',
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlign: 'center',
  },
  monthDayInputGlass: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pickerButtonWrap: { flex: 1, gap: spacing.xs },
  pickerButton: {
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
  },
  pickerButtonActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  pickerButtonText: { color: colors.text, fontSize: 16 },
  picker: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  done: { alignItems: 'center', padding: spacing.md },
  doneText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
