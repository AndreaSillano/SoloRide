import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { RideFormValues } from '@/features/rides';
import { colors, radius, spacing } from '@/theme';

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

  const pickerMode = picker === 'notificationTime' ? 'time' : 'date';
  const pickerValue = picker ? dateFromValue(value[picker], pickerMode) : new Date();

  const handlePickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setPicker(null);
    if (event.type === 'dismissed' || !date || !picker) return;
    set(picker, picker === 'notificationTime' ? toTimeValue(date) : toDateValue(date));
  };

  return (
    <View style={styles.form}>
      <Field
        autoCapitalize="sentences"
        editable={!disabled}
        label="Ride name"
        maxLength={100}
        onChangeText={(text) => set('name', text)}
        placeholder="Morning miles"
        value={value.name}
      />
      <Field
        autoCapitalize="sentences"
        editable={!disabled}
        label="Description (optional)"
        maxLength={2000}
        multiline
        onChangeText={(text) => set('description', text)}
        placeholder="What are you riding toward?"
        style={styles.description}
        value={value.description}
      />
      <View style={styles.dateRow}>
        <PickerButton
          disabled={disabled}
          label="Starts"
          onPress={() => setPicker('startDate')}
          value={value.startDate || 'Choose date'}
        />
        <PickerButton
          disabled={disabled}
          label="Ends"
          onPress={() => setPicker('endDate')}
          value={value.endDate || 'Choose date'}
        />
      </View>
      <View style={styles.group}>
        <Text style={styles.label}>Posting days</Text>
        <WeekdaySelector
          disabled={disabled}
          onChange={(weekdays) => set('weekdays', weekdays)}
          value={value.weekdays}
        />
        <View style={styles.scheduleMode}>
          <View style={styles.scheduleModeText}>
            <Text style={styles.label}>Strict schedule</Text>
            <Body muted>
              {value.strictSchedule
                ? 'Members must post on every selected day.'
                : 'Members can post on any one selected day each week.'}
            </Body>
          </View>
          <Switch
            disabled={disabled}
            onValueChange={(strictSchedule) => set('strictSchedule', strictSchedule)}
            trackColor={{ true: colors.primary }}
            value={value.strictSchedule}
          />
        </View>
      </View>
      <PickerButton
        disabled={disabled}
        label="Notification time"
        onPress={() => setPicker('notificationTime')}
        value={value.notificationTime}
      />
      {picker ? (
        <View style={styles.picker}>
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
        </View>
      ) : null}
    </View>
  );
}

function PickerButton({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.pickerButtonWrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pickerButton,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <Text style={styles.pickerButtonText}>{value}</Text>
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
  description: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  pickerButtonWrap: { flex: 1, gap: spacing.xs },
  pickerButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  pickerButtonText: { color: colors.text, fontSize: 16 },
  picker: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  done: { alignItems: 'center', padding: spacing.md },
  doneText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
