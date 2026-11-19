import { useLocalSearchParams } from 'expo-router';
import { ProfileWizard } from '../../../../components/ProfileWizard';

export default function EditProfile() {
  const { id, step } = useLocalSearchParams<{ id: string; step?: string }>();
  return <ProfileWizard key={id} profileId={id} initialStep={step ? parseInt(step, 10) || 0 : 0} />;
}
